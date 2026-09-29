import { ref, type Ref } from "vue"
import { type ServerRecord } from "~/lib/db"
import { useVaultCrypto } from "~/composables/useVaultCrypto"
import { useAuth } from "~/composables/useAuth"
import { useSettings } from "~/composables/useSettings"
import { useNuxtApp, useRuntimeConfig } from "#app"
import type { WasmSshPersistentExec } from "~/plugins/websh-shell-wasm.client"

const { loadVaultCrypto } = useVaultCrypto()

interface ServerSecret {
    password?: string
    privateKeyPem?: string
    passphrase?: string
}

export interface RemoteFile {
    name: string
    isDir: boolean
    size: number
    modifiedAt: number
    permissions: string
}

type FileManagerController = ReturnType<typeof createFileManager>

interface SharedFileManagerEntry {
    manager: FileManagerController
    refs: number
}

const sharedFileManagers = new Map<string, SharedFileManagerEntry>()

const createFileManager = (masterPassword: Ref<string>) => {
    const currentPath = ref("/")
    const files = ref<RemoteFile[]>([])
    const loading = ref(false)
    const status = ref("")
    const activeServer = ref<ServerRecord | null>(null)
    const connectionState = ref<"offline" | "connecting" | "connected">(
        "offline"
    )

    let persistentExec: WasmSshPersistentExec | null = null
    let persistentWs: WebSocket | null = null
    let routingInterval: ReturnType<typeof setInterval> | null = null

    const { token } = useAuth()
    const { settings } = useSettings()
    const runtimeConfig = useRuntimeConfig()

    function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
        const copy = new Uint8Array(bytes.byteLength)
        copy.set(bytes)
        return copy.buffer
    }

    function buildProxyUrl(server: ServerRecord): string {
        const base = runtimeConfig.public.proxyBaseUrl?.trim()
        let wsBase: string
        if (base) {
            wsBase = base
        } else if (import.meta.client) {
            const scheme = window.location.protocol === "https:" ? "wss" : "ws"
            wsBase = `${scheme}://${window.location.hostname || "127.0.0.1"}:5151/ws`
        } else {
            wsBase = "ws://127.0.0.1:5151/ws"
        }

        const url = new URL(wsBase)
        url.searchParams.set("host", server.host)
        url.searchParams.set("port", String(server.port))
        if (token.value?.trim()) url.searchParams.set("token", token.value)
        if (settings.value.preferredNode)
            url.searchParams.set("preferred_node", settings.value.preferredNode)
        return url.toString()
    }

    function clearRoutingInterval() {
        if (routingInterval !== null) {
            clearInterval(routingInterval)
            routingInterval = null
        }
    }

    function releaseTransport(
        exec: WasmSshPersistentExec | null = persistentExec,
        ws: WebSocket | null = persistentWs
    ) {
        clearRoutingInterval()

        if (exec) {
            try {
                exec.free()
            } catch {}
        }

        if (persistentExec === exec) {
            persistentExec = null
        }
        if (persistentWs === ws) {
            persistentWs = null
        }

        connectionState.value = "offline"
    }

    async function disconnectTransport(): Promise<void> {
        const exec = persistentExec
        const ws = persistentWs

        clearRoutingInterval()

        if (ws) {
            ws.onclose = null
            ws.onerror = null
            ws.onmessage = null
        }

        if (exec) {
            try {
                await exec.disconnect()
            } catch {}
        }

        if (ws && ws.readyState < WebSocket.CLOSING) {
            try {
                ws.close()
            } catch {}
        }

        releaseTransport(exec, ws)
    }

    async function closeSession(): Promise<void> {
        await disconnectTransport()
        activeServer.value = null
    }

    async function startSession(server: ServerRecord): Promise<void> {
        await disconnectTransport()
        connectionState.value = "connecting"

        const { decryptSecret } = await loadVaultCrypto()
        const secret = await decryptSecret<ServerSecret>(
            masterPassword.value,
            server.secret
        )

        const authMethod =
            server.authType === "password"
                ? { type: "password", password: secret.password ?? "" }
                : {
                      type: "privateKey",
                      privateKeyPem: secret.privateKeyPem ?? "",
                      passphrase: secret.passphrase || null,
                  }

        const wasmModule = await useNuxtApp().$WebSHWasm.load()
        const exec: WasmSshPersistentExec =
            new wasmModule.WasmSshPersistentExec({
                username: server.username,
                cols: 80,
                rows: 24,
                expectedHostKey: server.hostKey ?? null,
                authMethod,
            })

        const ws = new WebSocket(buildProxyUrl(server))
        ws.binaryType = "arraybuffer"

        try {
            await new Promise<void>((resolve, reject) => {
                ws.onerror = () => reject(new Error("WebSocket error"))
                ws.onopen = () => resolve()
            })

            ws.onmessage = (e) => {
                const data =
                    e.data instanceof ArrayBuffer
                        ? new Uint8Array(e.data)
                        : new Uint8Array((e.data as Blob).size)
                try {
                    const target = persistentExec ?? exec
                    if (target) {
                        target.pushServerBytes(data)
                    }
                } catch (err) {
                    console.warn(
                        "WASM pushServerBytes failed (possibly freed):",
                        err
                    )
                }
            }

            ws.onerror = () => {
                if (connectionState.value === "connected") {
                    status.value = "SSH connection lost."
                }
            }

            ws.onclose = (event) => {
                if (persistentWs !== ws && persistentExec !== exec) {
                    return
                }

                releaseTransport(exec, ws)
                status.value = event.reason?.trim() || "SSH connection lost."
            }

            routingInterval = setInterval(() => {
                const outgoing = exec.drainOutput()
                if (outgoing.length > 0 && ws.readyState === WebSocket.OPEN) {
                    ws.send(toArrayBuffer(outgoing))
                }
            }, 10)

            await exec.connect()

            persistentExec = exec
            persistentWs = ws
            connectionState.value = "connected"
        } catch (error) {
            ws.onclose = null
            ws.onerror = null
            ws.onmessage = null

            if (ws.readyState < WebSocket.CLOSING) {
                try {
                    ws.close()
                } catch {}
            }

            try {
                await exec.disconnect()
            } catch {}

            releaseTransport(exec, ws)
            throw error
        }
    }

    async function runExec(command: string): Promise<Uint8Array> {
        if (!persistentExec) throw new Error("No active SSH session")
        return persistentExec.execBytes(command)
    }

    function parseLsOutput(output: string, basePath: string): RemoteFile[] {
        const lines = output.split("\n").filter((l) => l.trim())
        const result: RemoteFile[] = []

        for (const line of lines) {
            const parts = line.split(/\s+/)
            if (parts.length < 7) continue

            const permissions = parts[0] ?? ""
            const size = parseInt(parts[4] ?? "0", 10)
            const epoch = parseInt(parts[5] ?? "0", 10)
            const name = parts.slice(6).join(" ")

            if (name === "." || name === "..") continue
            if (!permissions) continue

            const isDir =
                permissions.startsWith("d") ||
                (permissions.startsWith("l") && name.includes(" -> "))

            const realName = name.includes(" -> ")
                ? name.split(" -> ")[0]!
                : name

            result.push({
                name: realName,
                isDir,
                size: isNaN(size) ? 0 : size,
                modifiedAt: isNaN(epoch) ? 0 : epoch * 1000,
                permissions,
            })
        }

        return result.sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
            return a.name.localeCompare(b.name)
        })
    }

    const listDir = async (path: string): Promise<boolean> => {
        if (!activeServer.value) {
            status.value = "No server selected."
            return false
        }

        loading.value = true
        status.value = ""

        try {
            const safeCmd = `ls -laL --time-style=+%s ${JSON.stringify(path)} 2>&1`
            const bytes = await runExec(safeCmd)
            const output = new TextDecoder().decode(bytes)

            if (output.startsWith("ls: cannot access")) {
                status.value = `Cannot access: ${path}`
                return false
            }

            files.value = parseLsOutput(output, path)
            currentPath.value = path
            return true
        } catch (err) {
            status.value = `Error: ${String(err)}`
            return false
        } finally {
            loading.value = false
        }
    }

    const loadInitialDirectory = async (preferredPath?: string) => {
        if (preferredPath && (await listDir(preferredPath))) {
            return
        }

        try {
            const bytes = await runExec("cd ~ && pwd")
            const home = new TextDecoder().decode(bytes).trim()
            if (home.startsWith("/") && (await listDir(home))) {
                return
            }
        } catch {}

        await listDir("/")
    }

    const readRemoteFileBytes = async (path: string): Promise<Uint8Array> => {
        const safeCmd = `base64 -w0 ${JSON.stringify(path)}`
        const bytes = await runExec(safeCmd)
        const b64 = new TextDecoder().decode(bytes).trim()
        return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    }

    const writeRemoteFileBytes = async (
        destPath: string,
        data: Uint8Array
    ): Promise<void> => {
        let b64 = ""
        const CHUNK = 8192
        for (let i = 0; i < data.length; i += CHUNK) {
            b64 += btoa(String.fromCharCode(...data.subarray(i, i + CHUNK)))
        }
        const safeCmd = `printf '%s' ${JSON.stringify(b64)} | base64 -d > ${JSON.stringify(destPath)}`
        await runExec(safeCmd)
    }

    const downloadFile = async (path: string, name: string): Promise<void> => {
        if (!activeServer.value) return

        loading.value = true
        status.value = `Downloading ${name}...`

        try {
            const safeCmd = `base64 -w0 ${JSON.stringify(path)}`
            const bytes = await runExec(safeCmd)
            const b64 = new TextDecoder().decode(bytes).trim()
            const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

            const blob = new Blob([decoded])
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = name
            a.click()
            URL.revokeObjectURL(url)

            status.value = `Downloaded ${name}.`
        } catch (err) {
            status.value = `Download failed: ${String(err)}`
        } finally {
            loading.value = false
        }
    }

    const uploadFile = async (path: string, file: File): Promise<void> => {
        if (!activeServer.value) return

        loading.value = true
        status.value = `Uploading ${file.name}...`

        try {
            const arrayBuffer = await file.arrayBuffer()
            const bytes = new Uint8Array(arrayBuffer)
            let b64 = ""
            const CHUNK = 8192
            for (let i = 0; i < bytes.length; i += CHUNK) {
                b64 += btoa(
                    String.fromCharCode(...bytes.subarray(i, i + CHUNK))
                )
            }

            const destPath = `${path.replace(/\/$/, "")}/${file.name}`
            const safeCmd = `printf '%s' ${JSON.stringify(b64)} | base64 -d > ${JSON.stringify(destPath)}`
            await runExec(safeCmd)

            status.value = `Uploaded ${file.name}.`
            await listDir(currentPath.value)
        } catch (err) {
            status.value = `Upload failed: ${String(err)}`
        } finally {
            loading.value = false
        }
    }

    const deleteFile = async (path: string, isDir: boolean): Promise<void> => {
        if (!activeServer.value) return

        loading.value = true
        status.value = ""

        try {
            const safeCmd = isDir
                ? `rm -rf ${JSON.stringify(path)}`
                : `rm -f ${JSON.stringify(path)}`
            await runExec(safeCmd)
            status.value = `Deleted.`
            await listDir(currentPath.value)
        } catch (err) {
            status.value = `Delete failed: ${String(err)}`
        } finally {
            loading.value = false
        }
    }

    const navigateTo = async (path: string): Promise<void> => {
        await listDir(path)
    }

    const navigateUp = async (): Promise<void> => {
        const parent = currentPath.value.replace(/\/[^/]+\/?$/, "") || "/"
        await listDir(parent)
    }

    const openFor = async (server: ServerRecord): Promise<void> => {
        activeServer.value = server
        currentPath.value = "/"
        files.value = []
        status.value = "Connecting…"
        loading.value = true
        try {
            await startSession(server)
            status.value = ""
        } catch (err) {
            status.value = `Connection failed: ${String(err)}`
            loading.value = false
            return
        }
        loading.value = false
        await loadInitialDirectory()
    }

    const reconnectActiveSession = async (): Promise<void> => {
        const server = activeServer.value
        if (!server || connectionState.value === "connecting") {
            return
        }

        const preferredPath = currentPath.value
        status.value = "Reconnecting…"
        loading.value = true

        try {
            await startSession(server)
            status.value = ""
        } catch (err) {
            status.value = `Reconnect failed: ${String(err)}`
            loading.value = false
            return
        }

        loading.value = false
        await loadInitialDirectory(preferredPath)
    }

    return {
        currentPath,
        files,
        loading,
        status,
        activeServer,
        connectionState,
        openFor,
        reconnectActiveSession,
        closeSession,
        readRemoteFileBytes,
        writeRemoteFileBytes,
        listDir,
        navigateTo,
        navigateUp,
        downloadFile,
        uploadFile,
        deleteFile,
    }
}

export const useFileManager = (masterPassword: Ref<string>) =>
    createFileManager(masterPassword)

export const useSharedFileManager = (
    masterPassword: Ref<string>,
    key = "default"
) => {
    let entry = sharedFileManagers.get(key)
    if (!entry) {
        entry = {
            manager: createFileManager(masterPassword),
            refs: 0,
        }
        sharedFileManagers.set(key, entry)
    }

    entry.refs += 1

    const release = () => {
        const current = sharedFileManagers.get(key)
        if (!current) return

        current.refs = Math.max(0, current.refs - 1)
    }

    return {
        ...entry.manager,
        release,
    }
}

export const disposeSharedFileManager = async (key: string) => {
    const entry = sharedFileManagers.get(key)
    if (!entry) return

    await entry.manager.closeSession()
    sharedFileManagers.delete(key)
}

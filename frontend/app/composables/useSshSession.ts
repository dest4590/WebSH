import { ref, shallowRef, computed, watch, type Ref } from "vue"
import { db, type ServerRecord } from "~/lib/db"
import { useAuth } from "~/composables/useAuth"
import { useDialog } from "~/composables/useDialog"
import { useVaultCrypto } from "~/composables/useVaultCrypto"
import { type Terminal } from "@xterm/xterm"
import { useRouter, useRuntimeConfig, useNuxtApp } from "#app"
import { useSettings } from "~/composables/useSettings"
import { useNodes } from "~/composables/useNodes"
import { useVault } from "~/composables/useVault"

const { loadVaultCrypto } = useVaultCrypto()

interface ServerSecret {
    password?: string
    privateKeyPem?: string
    passphrase?: string
}

export interface WasmSshSession {
    pushServerBytes(data: Uint8Array): void
    drainOutput(): Uint8Array
    pollOutgoing(): Promise<Uint8Array>
    sendInput(data: Uint8Array): Promise<Uint8Array>
    resizeTerminal(cols: number, rows: number): Promise<Uint8Array>
    pollOutput(): Promise<Uint8Array>
    getServerHostKey(): string | undefined
    close(): Promise<void>
    connect(): Promise<void>
}

export const useSshSession = (
    masterPassword: Ref<string>,
    terminal: Ref<Terminal | null>,
    onCloseTab?: () => void
) => {
    const socket = shallowRef<WebSocket | null>(null)
    const sshSession = shallowRef<WasmSshSession | null>(null)
    const connectionState = ref<"offline" | "connecting" | "connected">(
        "offline"
    )
    const status = ref("")
    const { token } = useAuth()
    const { showAlert, showConfirm } = useDialog()
    const { settings } = useSettings()
    const { getBestNode } = useNodes()
    const vault = useVault()
    const router = useRouter()

    const runtimeConfig = useRuntimeConfig()
    const textEncoder = new TextEncoder()
    let terminalDecoder = new TextDecoder()
    let outputPolling = false
    let isDisconnecting = false
    let unloadHandler: (() => void) | null = null

    if (import.meta.client) {
        unloadHandler = () => {
            if (socket.value) {
                disconnect("Page closed.")
            }
        }
        window.addEventListener("beforeunload", unloadHandler)
        window.addEventListener("pagehide", unloadHandler)
    }

    let outputHistory = ""
    let historyCursor = 0
    const outputTap = ref<((data: string) => void) | null>(null)

    const terminalActions: Array<
        { type: "clear" } | { type: "write"; data: string }
    > = []

    function flushTerminalActions() {
        if (!terminal.value) return
        if (historyCursor < outputHistory.length) {
            terminal.value.write(outputHistory.slice(historyCursor))
            historyCursor = outputHistory.length
        }

        for (const action of terminalActions) {
            if (action.type === "clear") {
                terminal.value.clear()
            } else {
                terminal.value.write(action.data)
            }
        }
        terminalActions.length = 0
    }

    function enqueueTerminalAction(
        action: { type: "clear" } | { type: "write"; data: string }
    ) {
        if (terminal.value) {
            if (action.type === "clear") {
                terminal.value.clear()
            } else {
                terminal.value.write(action.data)
            }
            return
        }

        terminalActions.push(action)
    }

    function writeTerminal(data: string) {
        try {
            outputHistory += data
            if (outputHistory.length > 200 * 1024) {
                outputHistory = outputHistory.slice(
                    outputHistory.length - 200 * 1024
                )
                historyCursor = Math.max(
                    0,
                    historyCursor - (outputHistory.length - 200 * 1024)
                )
            }
        } catch {}

        if (outputTap.value) {
            try {
                outputTap.value(data)
            } catch {}
        }

        enqueueTerminalAction({ type: "write", data })
    }

    function clearTerminal() {
        terminalActions.length = 0
        enqueueTerminalAction({ type: "clear" })
    }

    watch(terminal, (value) => {
        if (value) {
            flushTerminalActions()
        }
    })

    const resolvedProxyBaseUrl = computed(() => {
        if (runtimeConfig.public.proxyBaseUrl?.trim()) {
            return runtimeConfig.public.proxyBaseUrl
        }
        if (!import.meta.client) return "ws://127.0.0.1:5151/ws"
        const scheme = window.location.protocol === "https:" ? "wss" : "ws"
        return `${scheme}://${window.location.hostname || "127.0.0.1"}:5151/ws`
    })

    function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
        const copy = new Uint8Array(bytes.byteLength)
        copy.set(bytes)
        return copy.buffer
    }

    function buildProxyUrl(server: ServerRecord): string {
        const url = new URL(resolvedProxyBaseUrl.value)
        url.searchParams.set("host", server.host)
        url.searchParams.set("port", String(server.port))
        if (token.value?.trim()) {
            url.searchParams.set("token", token.value)
        }

        const preferredNode = settings.value.preferredNode

        if (preferredNode) {
            url.searchParams.set("preferred_node", preferredNode)
        }

        return url.toString()
    }

    async function startOutputPolling(session: WasmSshSession) {
        outputPolling = true
        while (outputPolling) {
            try {
                const data = await session.pollOutput()
                if (data.byteLength > 0) {
                    writeTerminal(
                        terminalDecoder.decode(data, { stream: true })
                    )
                }
            } catch (err) {
                const message = String(err).replace(/^Error:\s*/i, "")
                status.value = message
                disconnect()
                break
            }
        }
    }

    async function startOutgoingPolling(
        session: WasmSshSession,
        ws: WebSocket
    ) {
        while (outputPolling && ws.readyState === WebSocket.OPEN) {
            try {
                const data = await session.pollOutgoing()
                if (data.byteLength > 0 && ws.readyState === WebSocket.OPEN) {
                    ws.send(toArrayBuffer(data))
                }
            } catch {
                break
            }
        }
    }

    function disconnect(message = "Disconnected.") {
        if (isDisconnecting) {
            return
        }
        isDisconnecting = true

        outputPolling = false
        sshSession.value?.close().catch(() => {})
        socket.value?.close(1000, message)
        socket.value = null
        sshSession.value = null
        connectionState.value = "offline"
        terminalActions.length = 0

        if (import.meta.client && unloadHandler) {
            window.removeEventListener("beforeunload", unloadHandler)
            window.removeEventListener("pagehide", unloadHandler)
            unloadHandler = null
        }

        isDisconnecting = false
    }

    async function connectToServer(server: ServerRecord) {
        if (!masterPassword.value.trim() && !vault.vaultReady.value) {
            status.value = "Unlock the vault first."
            return
        }

        disconnect()
        connectionState.value = "connecting"
        clearTerminal()
        const displayHost = settings.value?.hideSensitive ? "•••" : server.host
        writeTerminal(
            `\x1b[1;36m[WebSH]\x1b[0m Connecting to ${displayHost}:${server.port}...\r\n`
        )

        try {
            const { decryptSecret } = await loadVaultCrypto()

            const secret = await decryptSecret<ServerSecret>(
                masterPassword.value,
                server.secret
            )

            const wasmModule = await useNuxtApp().$WebSHWasm.load()

            const authMethod =
                server.authType === "password"
                    ? { type: "password", password: secret.password ?? "" }
                    : {
                          type: "privateKey",
                          privateKeyPem: secret.privateKeyPem ?? "",
                          passphrase: secret.passphrase || null,
                      }

            const ws = new WebSocket(buildProxyUrl(server))
            ws.binaryType = "arraybuffer"

            ws.onopen = async () => {
                try {
                    status.value = "Running SSH handshake..."
                    socket.value = ws

                    const session = new wasmModule.WasmSshSession({
                        username: server.username,
                        host: server.host,
                        port: server.port,
                        expectedHostKey: server.hostKey,
                        cols: Math.max(terminal.value?.cols ?? 80, 1),
                        rows: Math.max(terminal.value?.rows ?? 24, 1),
                        authMethod,
                    })
                    sshSession.value = session

                    ws.onmessage = (event) => {
                        const data =
                            event.data instanceof ArrayBuffer
                                ? new Uint8Array(event.data)
                                : new Uint8Array((event.data as Blob).size)
                        session.pushServerBytes(data)
                    }

                    startOutputPolling(session)
                    startOutgoingPolling(session, ws)

                    try {
                        await session.connect()
                    } catch (err) {
                        const actualHostKey = session.getServerHostKey()

                        if (
                            actualHostKey &&
                            server.hostKey &&
                            actualHostKey !== server.hostKey
                        ) {
                            await showAlert(
                                `WARNING: HOST KEY CHANGED!\nExpected: ${server.hostKey}\nActual: ${actualHostKey}\nThis could be a Man-in-the-Middle attack!`,
                                { title: "Host Key Changed", okLabel: "OK" }
                            )
                            disconnect("Host key mismatch.")
                            return
                        }

                        status.value = `SSH handshake failed: ${String(err)}`
                        disconnect()
                        return
                    }

                    const actualHostKey = session.getServerHostKey()
                    if (actualHostKey && actualHostKey !== server.hostKey) {
                        if (!server.hostKey) {
                            if (
                                await showConfirm(
                                    `New host key detected: ${actualHostKey}\nDo you want to trust this host?`,
                                    {
                                        title: "Trust Host Key",
                                        okLabel: "Trust",
                                        cancelLabel: "Reject",
                                    }
                                )
                            ) {
                                if (server.id) {
                                    await db.servers.update(server.id, {
                                        hostKey: actualHostKey,
                                    })
                                } else {
                                    const existing = await db.servers
                                        .where({
                                            host: server.host,
                                            port: server.port,
                                            username: server.username,
                                        })
                                        .first()

                                    if (existing && existing.id) {
                                        await db.servers.update(existing.id, {
                                            hostKey: actualHostKey,
                                        })
                                        server.id = existing.id
                                    } else {
                                        const now = Date.now()
                                        const toAdd = {
                                            ...server,
                                            hostKey: actualHostKey,
                                            createdAt:
                                                (server.createdAt as number) ||
                                                now,
                                            updatedAt: now,
                                        } as unknown as ServerRecord
                                        const newId =
                                            await db.servers.add(toAdd)
                                        server.id = newId
                                    }
                                }

                                server.hostKey = actualHostKey
                            } else {
                                disconnect("Host key rejected.")
                                return
                            }
                        } else {
                            await showAlert(
                                `WARNING: HOST KEY CHANGED!\nExpected: ${server.hostKey}\nActual: ${actualHostKey}\nThis could be a Man-in-the-Middle attack!`,
                                { title: "Host Key Changed", okLabel: "OK" }
                            )
                            disconnect("Host key mismatch.")
                            return
                        }
                    }

                    startOutputPolling(session)
                    startOutgoingPolling(session, ws)

                    connectionState.value = "connected"
                    status.value = "SSH session established."
                } catch (err) {
                    status.value = `SSH handshake failed: ${String(err)}`
                    disconnect()
                }
            }

            ws.onerror = (ev) => {
                console.error(
                    "WebSocket error:",
                    ev,
                    "ws.readyState=",
                    ws.readyState
                )
                status.value = `WebSocket relay failed (readyState=${ws.readyState}).`

                try {
                    const url = new URL(ws.url)
                    const host = url.searchParams.get("host") || "unknown host"
                    const port = url.searchParams.get("port") || "unknown port"
                    showAlert(
                        `Unable to reach relay for ${host}:${port}. Check network, relay availability, and server logs. See console for details.`,
                        { title: "Relay Unavailable", okLabel: "OK" }
                    ).catch(() => {})
                } catch {
                    showAlert(
                        "Unable to reach the WebSocket relay. See console for details.",
                        {
                            title: "Relay Unavailable",
                            okLabel: "OK",
                        }
                    ).catch(() => {})
                }

                disconnect()
            }

            ws.onclose = async (event) => {
                const reason =
                    event.reason ||
                    (event.code === 1008
                        ? "Session rejected."
                        : "Connection closed.")
                connectionState.value = "offline"
                socket.value = null
                sshSession.value = null
                terminalDecoder = new TextDecoder()
                status.value = reason
                writeTerminal(`\r\n\x1b[1;31m[WebSH]\x1b[0m ${reason}\r\n`)

                try {
                    if (
                        reason &&
                        reason.toLowerCase().includes("subscription")
                    ) {
                        const goToPlans = await showConfirm(
                            "You have reached the free plan concurrent-connection limit.\nCheck our plans to continue using WebSH without interruptions.",
                            {
                                title: "Subscription Limit Reached",
                                okLabel: "Check plans",
                                cancelLabel: "OK",
                            }
                        )

                        if (goToPlans) {
                            await router.push("/plans")
                        }
                    }
                } catch {}
            }
        } catch (err) {
            connectionState.value = "offline"
            status.value = `Connection failed: ${String(err)}`
        }
    }

    async function sendInput(input: string) {
        if (sshSession.value && connectionState.value === "connected") {
            try {
                await sshSession.value.sendInput(textEncoder.encode(input))
            } catch {}
        }
    }

    async function resizeTerminal(cols: number, rows: number) {
        if (
            cols <= 0 ||
            rows <= 0 ||
            !sshSession.value ||
            connectionState.value !== "connected"
        ) {
            return
        }

        try {
            await sshSession.value.resizeTerminal(cols, rows)
        } catch {}
    }

    return {
        socket,
        sshSession,
        connectionState,
        status,
        outputTap,
        connectToServer,
        disconnect,
        sendInput,
        resizeTerminal,
    }
}

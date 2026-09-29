import { ref, reactive, computed, type Ref } from "vue"
import { db, type AuthType, type ServerRecord } from "~/lib/db"
import { useVaultCrypto } from "~/composables/useVaultCrypto"

const { loadVaultCrypto } = useVaultCrypto()

interface ServerSecret {
    password?: string
    privateKeyPem?: string
    passphrase?: string
}

interface ServerFormFields {
    name: string
    host: string
    port: number
    username: string
    authType: AuthType
    password: string
    privateKeyPem: string
    passphrase: string
}

interface SshHostConfig {
    name: string
    host: string
    port: number
    user: string
    identityFile?: string
}

interface MissingKeyHost {
    name: string
    path: string
}

interface ImportSshHostResult {
    imported: boolean
    missingKeyPath?: string
}

const DEFAULT_SERVER_PORT = 22
const DEFAULT_SERVER_USERNAME = "root"

type EncryptServerSecret = Awaited<
    ReturnType<typeof loadVaultCrypto>
>["encryptSecret"]

const createEmptyServerForm = (): ServerFormFields => ({
    name: "",
    host: "",
    port: DEFAULT_SERVER_PORT,
    username: DEFAULT_SERVER_USERNAME,
    authType: "password",
    password: "",
    privateKeyPem: "",
    passphrase: "",
})

const normalizeServerFormFields = (
    formData: ServerFormFields
): ServerFormFields => ({
    name: formData.name.trim(),
    host: formData.host.trim(),
    port: Number(formData.port) || DEFAULT_SERVER_PORT,
    username: formData.username.trim(),
    authType: formData.authType,
    password: formData.password,
    privateKeyPem: formData.privateKeyPem,
    passphrase: formData.passphrase,
})

const getServerValidationError = (
    masterPassword: string,
    formData: ServerFormFields
) => {
    if (!masterPassword.trim()) {
        return "Unlock the vault before storing credentials."
    }

    if (!formData.name || !formData.host || !formData.username) {
        return "Name, host, and username are required."
    }

    return null
}

const createServerSecretPayload = (
    formData: ServerFormFields
): ServerSecret => ({
    password: formData.authType === "password" ? formData.password : undefined,
    privateKeyPem:
        formData.authType === "privateKey" ? formData.privateKeyPem : undefined,
    passphrase:
        formData.authType === "privateKey" ? formData.passphrase : undefined,
})

const createSavedServerRecord = (
    formData: ServerFormFields,
    secret: ServerRecord["secret"],
    updatedAt: number
) => ({
    name: formData.name,
    host: formData.host,
    port: formData.port,
    username: formData.username,
    authType: formData.authType,
    secret,
    updatedAt,
})

const createEditableServerForm = (
    server: ServerRecord,
    secret: ServerSecret
): ServerFormFields => ({
    name: server.name,
    host: server.host,
    port: server.port,
    username: server.username,
    authType: server.authType,
    password: server.authType === "password" ? (secret.password ?? "") : "",
    privateKeyPem:
        server.authType === "privateKey" ? (secret.privateKeyPem ?? "") : "",
    passphrase:
        server.authType === "privateKey" ? (secret.passphrase ?? "") : "",
})

const formatMissingKeyHosts = (hosts: MissingKeyHost[]) =>
    hosts.map((host) => `${host.name} (${host.path})`).join(", ")

const buildSshImportStatusMessage = (
    importedCount: number,
    missingKeyHosts: MissingKeyHost[]
) => {
    if (missingKeyHosts.length === 0) {
        return `Imported ${importedCount} SSH host profile(s).`
    }

    return `Imported ${importedCount} SSH host profile(s). Keys missing for: ${formatMissingKeyHosts(
        missingKeyHosts
    )}. These IdentityFile paths were not found in the selected folder - import those private key files manually.`
}

const parseSshConfigLine = (rawLine: string) => {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) {
        return null
    }

    const parts = line.split(/\s+/).filter(Boolean)
    const keyword = parts[0]?.toLowerCase()
    if (!keyword) {
        return null
    }

    return {
        keyword,
        value: parts.slice(1).join(" ").trim(),
    }
}

const parsePositivePort = (value: string): number | null => {
    const port = Number(value)
    return !Number.isNaN(port) && port > 0 ? port : null
}

const parseHostPatterns = (value: string) =>
    value
        .split(/\s+/)
        .filter(Boolean)
        .map((entry) => entry.trim())

const createSshHostEntries = (
    hostPatterns: string[],
    config: Partial<SshHostConfig>
): SshHostConfig[] =>
    hostPatterns.map((pattern) => ({
        name: pattern,
        host: config.host ?? pattern,
        port: config.port ?? DEFAULT_SERVER_PORT,
        user: config.user ?? DEFAULT_SERVER_USERNAME,
        identityFile: config.identityFile,
    }))

const applySshConfigDirective = (
    keyword: string,
    value: string,
    config: Partial<SshHostConfig>
): Partial<SshHostConfig> => {
    switch (keyword) {
        case "hostname":
            return { ...config, host: value }
        case "user":
            return { ...config, user: value }
        case "port": {
            const port = parsePositivePort(value)
            return port === null ? config : { ...config, port }
        }
        case "identityfile":
            return { ...config, identityFile: value }
        default:
            return config
    }
}

const servers = ref<ServerRecord[]>([])
const activeServerId = ref<number | null>(null)
const status = ref("")
const form = reactive(createEmptyServerForm())

export const useServers = (masterPassword: Ref<string>) => {
    const selectedServer = computed(
        () => servers.value.find((s) => s.id === activeServerId.value) ?? null
    )

    const resetServerForm = () => {
        Object.assign(form, createEmptyServerForm())
    }

    const refreshServers = async () => {
        servers.value = await db.servers
            .orderBy("updatedAt")
            .reverse()
            .toArray()
        if (
            activeServerId.value &&
            servers.value.some((server) => server.id === activeServerId.value)
        ) {
            return
        }

        activeServerId.value = servers.value[0]?.id ?? null
    }

    const saveServer = async (
        serverId?: number,
        serverForm?: ServerFormFields
    ) => {
        const normalizedData = normalizeServerFormFields(serverForm ?? form)
        const validationError = getServerValidationError(
            masterPassword.value,
            normalizedData
        )

        if (validationError) {
            status.value = validationError
            return false
        }

        const { encryptSecret } = await loadVaultCrypto()
        const secret = await encryptSecret<ServerSecret>(
            masterPassword.value,
            createServerSecretPayload(normalizedData)
        )

        const now = Date.now()
        const serverRecord = createSavedServerRecord(
            normalizedData,
            secret,
            now
        )

        if (serverId) {
            await db.servers.update(serverId, serverRecord)
            activeServerId.value = serverId
            status.value = "Server profile updated."
        } else {
            const id = await db.servers.add({
                ...serverRecord,
                createdAt: now,
            })
            activeServerId.value = id
            status.value = "Server profile saved."
        }

        resetServerForm()
        await refreshServers()
        return true
    }

    const parseSshConfig = (text: string): SshHostConfig[] => {
        const hosts: SshHostConfig[] = []
        let currentHostPatterns: string[] = []
        let currentConfig: Partial<SshHostConfig> = {}

        const commitHostBlock = () => {
            if (!currentHostPatterns.length) return
            hosts.push(
                ...createSshHostEntries(currentHostPatterns, currentConfig)
            )
            currentHostPatterns = []
            currentConfig = {}
        }

        for (const rawLine of text.split(/\r?\n/)) {
            const parsedLine = parseSshConfigLine(rawLine)
            if (!parsedLine) {
                continue
            }

            if (parsedLine.keyword === "host") {
                commitHostBlock()
                currentHostPatterns = parseHostPatterns(parsedLine.value)
                continue
            }

            currentConfig = applySshConfigDirective(
                parsedLine.keyword,
                parsedLine.value,
                currentConfig
            )
        }

        commitHostBlock()
        return hosts
    }

    const normalizePath = (path: string) =>
        path.replace(/\\/g, "/").replace(/^~\/?/, "").replace(/^\/+/, "")

    const getImportedRelativePath = (file: File) =>
        ((file as any).webkitRelativePath ||
            (file as any).mozFullPath ||
            file.name) as string

    const buildImportedFileMap = (files: File[]) => {
        const fileMap = new Map<string, File>()

        for (const file of files) {
            fileMap.set(getImportedRelativePath(file), file)
        }

        return fileMap
    }

    const isSshConfigPath = (path: string) => {
        const normalized = normalizePath(path)
        return normalized === "config" || normalized.endsWith("/config")
    }

    const findSshConfigFile = (files: File[]) =>
        files.find((file) => isSshConfigPath(getImportedRelativePath(file)))

    const buildIdentityCandidates = (identityFile: string) => {
        const id = normalizePath(identityFile)
        const basename = id.split("/").pop() ?? id
        const candidates = new Set<string>()
        candidates.add(id)
        candidates.add(basename)

        const sshIndex = id.indexOf(".ssh/")
        if (sshIndex !== -1) {
            const afterSsh = id.slice(sshIndex + ".ssh/".length)
            candidates.add(afterSsh)
            candidates.add(`.ssh/${afterSsh}`)
        }

        const homeMatch = id.match(/home\/[^/]+\/(.+)/)
        if (homeMatch && homeMatch[1]) {
            candidates.add(homeMatch[1])
        }

        return Array.from(candidates)
    }

    const findKeyFile = (identityFile: string, files: Map<string, File>) => {
        const candidates = buildIdentityCandidates(identityFile)
        const basename = normalizePath(identityFile).split("/").pop() ?? ""

        return Array.from(files.entries()).find(([path]) => {
            const normalized = normalizePath(path)

            for (const c of candidates) {
                if (normalized === c) return true
                if (normalized.endsWith(`/${c}`)) return true
                if (normalized.includes(`/${c}`)) return true
                if (normalized.endsWith(c)) return true
            }

            if (
                basename &&
                (normalized.endsWith(`/${basename}`) ||
                    normalized.includes(`/${basename}`))
            ) {
                return true
            }

            return false
        })?.[1]
    }

    const readPrivateKeyPem = async (
        host: SshHostConfig,
        fileMap: Map<string, File>
    ): Promise<{ privateKeyPem?: string; missingKeyPath?: string }> => {
        if (!host.identityFile) {
            return {}
        }

        const keyFile = findKeyFile(host.identityFile, fileMap)
        if (!keyFile) {
            return { missingKeyPath: host.identityFile }
        }

        return { privateKeyPem: await keyFile.text() }
    }

    const findExistingImportedHost = (host: SshHostConfig) =>
        db.servers
            .where("host")
            .equals(host.host)
            .filter((server) => server.username === host.user)
            .first()

    const createImportedHostSecret = (
        encryptSecret: EncryptServerSecret,
        privateKeyPem?: string
    ) =>
        encryptSecret<ServerSecret>(masterPassword.value, {
            password: undefined,
            privateKeyPem,
            passphrase: undefined,
        })

    const importSshHost = async (
        host: SshHostConfig,
        fileMap: Map<string, File>,
        encryptSecret: EncryptServerSecret
    ): Promise<ImportSshHostResult> => {
        const existing = await findExistingImportedHost(host)
        if (existing) {
            return { imported: false }
        }

        const { privateKeyPem, missingKeyPath } = await readPrivateKeyPem(
            host,
            fileMap
        )
        const secret = await createImportedHostSecret(
            encryptSecret,
            privateKeyPem
        )
        const now = Date.now()

        await db.servers.add({
            name: host.name,
            host: host.host,
            port: host.port,
            username: host.user,
            authType: host.identityFile ? "privateKey" : "password",
            secret,
            createdAt: now,
            updatedAt: now,
        })

        return {
            imported: true,
            missingKeyPath,
        }
    }

    const importSshFolder = async (
        files: FileList | File[]
    ): Promise<boolean> => {
        if (!masterPassword.value.trim()) {
            status.value = "Unlock the vault before importing SSH profiles."
            return false
        }

        const fileArray = Array.from(files)
        const fileMap = buildImportedFileMap(fileArray)
        const configFile = findSshConfigFile(fileArray)

        if (!configFile) {
            status.value = "No SSH config file found in the selected folder."
            return false
        }

        const configText = await configFile.text()
        const hosts = parseSshConfig(configText)
        if (hosts.length === 0) {
            status.value = "No SSH Host entries found in SSH config."
            return false
        }

        const missingKeyHosts: Array<{ name: string; path: string }> = []
        let importedCount = 0
        const { encryptSecret } = await loadVaultCrypto()

        for (const host of hosts) {
            const result = await importSshHost(host, fileMap, encryptSecret)
            if (!result.imported) {
                continue
            }

            if (result.missingKeyPath) {
                missingKeyHosts.push({
                    name: host.name,
                    path: result.missingKeyPath,
                })
            }

            importedCount++
        }

        await refreshServers()
        status.value = buildSshImportStatusMessage(
            importedCount,
            missingKeyHosts
        )

        return importedCount > 0
    }

    const prepareEditServer = async (
        serverId: number
    ): Promise<ServerFormFields | null> => {
        const server = await db.servers.get(serverId)
        if (!server) return null

        const { decryptSecret } = await loadVaultCrypto()

        const secret = await decryptSecret<ServerSecret>(
            masterPassword.value,
            server.secret
        )

        return createEditableServerForm(server, secret)
    }

    const removeServer = async (serverId: number | undefined) => {
        if (!serverId) return
        if (activeServerId.value === serverId) {
            activeServerId.value = null
        }
        await db.servers.delete(serverId)
        await refreshServers()
        status.value = "Server profile removed."
    }

    const toggleBookmark = async (serverId: number | undefined) => {
        if (!serverId) return
        const server = await db.servers.get(serverId)
        if (server) {
            await db.servers.update(serverId, {
                isBookmarked: !server.isBookmarked,
            })
            await refreshServers()
        }
    }

    const replaceAll = async (incoming: ServerRecord[]) => {
        await db.servers.clear()

        for (const server of incoming) {
            const { id: _id, ...rest } = server
            await db.servers.add(rest)
        }

        await refreshServers()
        status.value = "Server profiles synced."
    }

    return {
        servers,
        activeServerId,
        selectedServer,
        form,
        status,
        refreshServers,
        saveServer,
        prepareEditServer,
        removeServer,
        toggleBookmark,
        importSshFolder,
        replaceAll,
    }
}

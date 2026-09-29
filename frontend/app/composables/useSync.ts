import { ref, computed, watch, isRef, type Ref } from "vue"
import { useApi } from "~/composables/useApi"
import { useAuth } from "~/composables/useAuth"
import {
    encryptForSync,
    decryptFromSync,
    clearSyncKeyCache,
    type SyncEnvelope,
} from "~/lib/syncCrypto"
import type { AppSettings } from "~/composables/useSettings"
import type { ServerRecord, SnippetRecord } from "~/lib/db"

export type SyncStatus = "idle" | "syncing" | "ok" | "error"
export type SyncDataType = "snippets" | "settings" | "servers"

interface ServerPlainSecret {
    password?: string
    privateKeyPem?: string
    passphrase?: string
}

/** Wire-format for server records: vault-specific EncryptedSecret is replaced
 *  with the decrypted plaintext so the record is portable across vaults. */
interface SyncServerRecord extends Omit<ServerRecord, "secret"> {
    plainSecret: ServerPlainSecret
}

interface SyncPayloadMap {
    snippets: SnippetRecord[]
    settings: AppSettings
    servers: SyncServerRecord[]
}

const SYNC_MAX_BYTES = 5 * 1024 * 1024

export const useSync = (masterPassword: Ref<string> | string) => {
    const { user, token } = useAuth()
    const masterRef: Ref<string> = isRef(masterPassword)
        ? (masterPassword as Ref<string>)
        : ref(masterPassword as string)
    const syncStatus = ref<SyncStatus>("idle")
    const syncError = ref("")
    const lastSyncAt = ref<number | null>(null)

    const isPro = computed(() => {
        const tier = user.value?.subscriptionTier ?? "free"
        return tier !== "free"
    })

    const { buildUrl, authHeaders } = useApi()

    watch(masterRef, (pw) => {
        if (!pw) clearSyncKeyCache()
    })

    const pushData = async <K extends SyncDataType>(
        dataType: K,
        data: SyncPayloadMap[K]
    ): Promise<boolean> => {
        if (!isPro.value || !user.value || !token.value || !masterRef.value) {
            return false
        }

        syncStatus.value = "syncing"
        syncError.value = ""

        try {
            const envelope = await encryptForSync(
                data,
                masterRef.value,
                user.value.email
            )
            const body = JSON.stringify({
                encrypted_payload: envelope,
            })

            if (body.length > SYNC_MAX_BYTES) {
                throw new Error("Snippet data is too large to sync (> 5 MB).")
            }

            const res = await fetch(buildUrl(`/sync/${dataType}`), {
                method: "PUT",
                headers: authHeaders(token.value),
                body,
            })

            if (!res.ok) {
                const payload = await res.json().catch(() => null)
                throw new Error(
                    (payload as { error?: string } | null)?.error ??
                        `Sync push failed: HTTP ${res.status}`
                )
            }

            syncStatus.value = "ok"
            lastSyncAt.value = Date.now()
            return true
        } catch (err) {
            syncStatus.value = "error"
            syncError.value =
                err instanceof Error ? err.message : "Sync push failed."
            return false
        }
    }

    const pullData = async <K extends SyncDataType>(
        dataType: K
    ): Promise<SyncPayloadMap[K] | null> => {
        if (!isPro.value || !user.value || !token.value || !masterRef.value) {
            return null
        }

        syncStatus.value = "syncing"
        syncError.value = ""

        try {
            const res = await fetch(buildUrl(`/sync/${dataType}`), {
                headers: authHeaders(token.value),
            })

            if (res.status === 404) {
                syncStatus.value = "ok"
                lastSyncAt.value = Date.now()
                return null
            }

            if (!res.ok) {
                const payload = await res.json().catch(() => null)
                throw new Error(
                    (payload as { error?: string } | null)?.error ??
                        `Sync pull failed: HTTP ${res.status}`
                )
            }

            const json = (await res.json()) as {
                encrypted_payload: SyncEnvelope
            }
            const envelope = json.encrypted_payload

            const payload = await decryptFromSync<SyncPayloadMap[K]>(
                envelope,
                masterRef.value,
                user.value.email
            )

            syncStatus.value = "ok"
            lastSyncAt.value = Date.now()
            return payload
        } catch (err) {
            syncStatus.value = "error"
            syncError.value =
                err instanceof Error ? err.message : "Sync pull failed."
            return null
        }
    }

    const pushSnippets = (snippets: SnippetRecord[]) =>
        pushData("snippets", snippets)

    const pullSnippets = () => pullData("snippets")

    const pushServers = async (servers: ServerRecord[]): Promise<boolean> => {
        if (!masterRef.value) return false
        const { decryptSecret } = await import("~/lib/vault")
        const syncRecords: SyncServerRecord[] = []
        for (const server of servers) {
            const plainSecret = await decryptSecret<ServerPlainSecret>(
                masterRef.value,
                server.secret
            )
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { secret: _vault, ...rest } = server
            syncRecords.push({ ...rest, plainSecret })
        }
        return pushData("servers", syncRecords)
    }

    const pullServers = async (): Promise<ServerRecord[] | null> => {
        if (!masterRef.value) return null
        const syncRecords = await pullData("servers")
        if (!syncRecords) return null
        const { encryptSecret } = await import("~/lib/vault")
        const servers: ServerRecord[] = []
        for (const record of syncRecords) {
            const { plainSecret, ...rest } = record
            const secret = await encryptSecret<ServerPlainSecret>(
                masterRef.value,
                plainSecret
            )
            servers.push({ ...rest, secret })
        }
        return servers
    }

    return {
        syncStatus,
        syncError,
        lastSyncAt,
        isPro,
        pushData,
        pullData,
        pushSettings: (settings: AppSettings) => pushData("settings", settings),
        pullSettings: () => pullData("settings"),
        pushServers,
        pullServers,
        pushSnippets,
        pullSnippets,
    }
}

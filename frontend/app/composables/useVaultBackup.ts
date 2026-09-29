import { ref } from "vue"
import { db } from "~/lib/db"

const BACKUP_VERSION = 1
const BACKUP_APP_TAG = "websh"

export interface VaultBackup {
    version: number
    app: string
    exportedAt: number
    vault: unknown
    servers: unknown[]
    snippets: unknown[]
}

export const useVaultBackup = () => {
    const exportStatus = ref("")
    const importStatus = ref("")
    const importing = ref(false)
    const exporting = ref(false)

    const exportVault = async (): Promise<void> => {
        exportStatus.value = ""
        exporting.value = true

        try {
            const vaultRecord = await db.vault.get("default")
            if (!vaultRecord) {
                exportStatus.value = "No vault found. Create a vault first."
                return
            }

            const servers = await db.servers.toArray()
            const snippets = await db.snippets.toArray()

            const backup: VaultBackup = {
                version: BACKUP_VERSION,
                app: BACKUP_APP_TAG,
                exportedAt: Date.now(),
                vault: vaultRecord,
                servers,
                snippets,
            }

            const json = JSON.stringify(backup, null, 2)
            const blob = new Blob([json], { type: "application/json" })
            const url = URL.createObjectURL(blob)

            const date = new Date().toISOString().slice(0, 10)
            const a = document.createElement("a")
            a.href = url
            a.download = `websh-vault-backup-${date}.json`
            a.click()
            URL.revokeObjectURL(url)

            exportStatus.value = `Exported ${servers.length} server(s) and ${snippets.length} snippet(s).`
        } catch (err) {
            exportStatus.value = `Export failed: ${String(err)}`
        } finally {
            exporting.value = false
        }
    }

    const importVault = async (file: File): Promise<boolean> => {
        importStatus.value = ""
        importing.value = true

        try {
            const text = await file.text()
            let backup: VaultBackup

            try {
                backup = JSON.parse(text) as VaultBackup
            } catch {
                importStatus.value = "Invalid file: not valid JSON."
                return false
            }

            if (
                backup.version !== BACKUP_VERSION ||
                backup.app !== BACKUP_APP_TAG
            ) {
                importStatus.value =
                    "Invalid backup file: unrecognized format or version."
                return false
            }

            if (!backup.vault || !Array.isArray(backup.servers)) {
                importStatus.value = "Invalid backup file: missing vault data."
                return false
            }

            await db.transaction(
                "rw",
                [db.vault, db.servers, db.snippets],
                async () => {
                    await db.vault.clear()
                    await db.servers.clear()
                    await db.snippets.clear()

                    await db.vault.put(backup.vault as never)

                    if (backup.servers.length > 0) {
                        await db.servers.bulkPut(
                            backup.servers.map((s) => {
                                const server = s as Record<string, unknown>
                                const { id: _id, ...rest } = server
                                return rest
                            }) as never[]
                        )
                    }

                    if (
                        Array.isArray(backup.snippets) &&
                        backup.snippets.length > 0
                    ) {
                        await db.snippets.bulkPut(
                            backup.snippets.map((s) => {
                                const snippet = s as Record<string, unknown>
                                const { id: _id, ...rest } = snippet
                                return rest
                            }) as never[]
                        )
                    }
                }
            )

            importStatus.value = `Imported ${backup.servers.length} server(s) and ${Array.isArray(backup.snippets) ? backup.snippets.length : 0} snippet(s). Reload the page to apply.`
            return true
        } catch (err) {
            importStatus.value = `Import failed: ${String(err)}`
            return false
        } finally {
            importing.value = false
        }
    }

    return {
        exportVault,
        importVault,
        exportStatus,
        importStatus,
        importing,
        exporting,
    }
}

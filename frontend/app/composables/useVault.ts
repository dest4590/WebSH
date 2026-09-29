import { ref, computed } from "vue"
import { db } from "~/lib/db"
import { useSettings } from "~/composables/useSettings"
import { useVaultCrypto } from "~/composables/useVaultCrypto"

const { loadVaultCrypto } = useVaultCrypto()

const masterPassword = ref("")
const vaultInitialized = ref(false)
const vaultReady = ref(false)
const status = ref("")

const AUTO_LOCK_DELAY_MS = 10 * 60 * 1000
let autoLockTimer: ReturnType<typeof setTimeout> | null = null

export const useVault = () => {
    const { clearStoredSettings } = useSettings()
    const isLocked = computed(() => !vaultReady.value)

    const clearAutoLockTimer = () => {
        if (autoLockTimer !== null) {
            clearTimeout(autoLockTimer)
            autoLockTimer = null
        }
    }

    const scheduleAutoLock = () => {
        clearAutoLockTimer()

        if (!vaultReady.value) {
            return
        }

        autoLockTimer = setTimeout(() => {
            lockVault()
            status.value = "Vault locked due to inactivity."
        }, AUTO_LOCK_DELAY_MS)
    }

    const refreshVaultState = async () => {
        const existing = await db.vault.get("default")
        const hasVault = Boolean(existing)

        vaultInitialized.value = hasVault

        if (!hasVault) {
            vaultReady.value = false
        }

        if (hasVault) {
            try {
                const { tryRestoreMasterKeyFromSession } =
                    await loadVaultCrypto()
                const restored = await tryRestoreMasterKeyFromSession()
                if (restored) {
                    vaultReady.value = true
                    scheduleAutoLock()
                }
            } catch {}
        }

        return hasVault
    }

    const unlockVault = async () => {
        if (!import.meta.client) {
            status.value = "Vault is only available in the browser."
            return false
        }

        if (!masterPassword.value.trim()) {
            status.value = "Enter a master password first."
            return false
        }

        const existing = await db.vault.get("default")
        const hasVault = Boolean(existing)

        vaultInitialized.value = hasVault

        const {
            clearVaultCryptoCache,
            createVaultRecord,
            isCurrentVaultRecord,
            verifyMasterPassword,
        } = await loadVaultCrypto()

        if (!existing) {
            await db.vault.put(await createVaultRecord(masterPassword.value))

            vaultInitialized.value = true
            vaultReady.value = true
            status.value =
                "Vault created. Remember this master password - it's the only way to access your data. Save a server profile to start."
            scheduleAutoLock()

            return true
        }

        if (!isCurrentVaultRecord(existing)) {
            status.value =
                "Unsupported local vault format. Clear browser storage and recreate the vault."
            vaultReady.value = false
            clearVaultCryptoCache()

            return false
        }

        if (!(await verifyMasterPassword(masterPassword.value, existing))) {
            status.value =
                "Master password verification failed. You can reset the vault, but this will erase ALL settings and data."
            vaultReady.value = false
            clearVaultCryptoCache()

            return false
        }

        vaultReady.value = true
        status.value = "Vault unlocked."
        scheduleAutoLock()

        try {
            const { persistMasterKeyInSession } = await loadVaultCrypto()
            void persistMasterKeyInSession(
                masterPassword.value,
                AUTO_LOCK_DELAY_MS
            )
        } catch {}

        return true
    }

    const lockVault = () => {
        void loadVaultCrypto()
            .then(({ clearVaultCryptoCache }) => {
                clearVaultCryptoCache()
            })
            .catch(() => {})

        masterPassword.value = ""
        vaultReady.value = false
        status.value = "Vault locked."
        clearAutoLockTimer()
    }

    const resetVault = async () => {
        if (!import.meta.client) {
            status.value = "Vault is only available in the browser."
            return false
        }

        const { clearVaultCryptoCache } = await loadVaultCrypto()

        await db.vault.delete("default")
        await db.servers.clear()
        await db.snippets.clear()
        clearStoredSettings()

        clearVaultCryptoCache()
        masterPassword.value = ""
        vaultInitialized.value = false
        vaultReady.value = false
        status.value =
            "Vault reset. Create a new master password to protect your vault."
        clearAutoLockTimer()

        return true
    }

    const resetAutoLockTimer = () => {
        if (vaultReady.value) {
            scheduleAutoLock()
        }
    }

    return {
        masterPassword,
        vaultInitialized,
        vaultReady,
        status,
        isLocked,
        refreshVaultState,
        unlockVault,
        lockVault,
        resetVault,
        resetAutoLockTimer,
    }
}

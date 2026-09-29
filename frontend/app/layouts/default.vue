<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue"
import { useRoute } from "#app"
import { useDialog } from "~/composables/useDialog"
import { useVault } from "~/composables/useVault"
import VaultUnlockModal from "~/components/VaultUnlockModal.vue"
import GlobalDialogHost from "~/components/GlobalDialogHost.vue"

const isBooted = ref(false)
const route = useRoute()
const vault = useVault()

const isLocked = vault.isLocked
const masterPassword = vault.masterPassword
const unlockVault = vault.unlockVault
const refreshVaultState = vault.refreshVaultState
const vaultInitialized = vault.vaultInitialized
const vaultStatus = vault.status
const vaultLoaded = ref(false)
const { showConfirm } = useDialog()

const showVaultUnlock = computed(() => {
    return (
        isBooted.value &&
        vaultLoaded.value &&
        isLocked.value &&
        route.path.startsWith("/app")
    )
})

watch(
    () => masterPassword.value,
    () => {
        if (vaultStatus.value) {
            vaultStatus.value = ""
        }
    }
)

onMounted(async () => {
    isBooted.value = true

    await refreshVaultState()

    vaultLoaded.value = true
})

const resetVault = vault.resetVault

const handleUnlock = async () => {
    await unlockVault()
}

const handleReset = async () => {
    const firstConfirmed = await showConfirm(
        "Resetting the vault will erase ALL settings and data. Continue?",
        {
            title: "Reset Vault",
            okLabel: "Yes, continue",
            cancelLabel: "No",
            maxWidth: "500px",
        }
    )

    if (!firstConfirmed) {
        return
    }

    const secondConfirmed = await showConfirm(
        "This is your last chance. Resetting the vault will permanently delete everything.",
        {
            title: "Confirm Reset",
            okLabel: "Reset Vault",
            cancelLabel: "Cancel",
            maxWidth: "500px",
        }
    )

    if (!secondConfirmed) {
        return
    }

    await resetVault()
}

const handleVaultPassword = (value: string) => {
    masterPassword.value = value
}
</script>

<template>
    <div class="min-h-screen bg-black text-white font-mono">
        <VaultUnlockModal
            v-if="showVaultUnlock"
            :open="showVaultUnlock"
            :password="masterPassword"
            :status="vaultStatus"
            :initialized="vaultInitialized"
            @update:password="handleVaultPassword"
            @unlock="handleUnlock"
            @reset="handleReset"
        />
        <NuxtPage />
        <GlobalDialogHost />
    </div>
</template>

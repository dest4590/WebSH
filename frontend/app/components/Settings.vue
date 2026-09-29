<script setup lang="ts">
import { computed, onMounted } from "vue"
import { useAuth } from "~/composables/useAuth"
import { useServers } from "~/composables/useServers"
import { useSnippets } from "~/composables/useSnippets"
import { useSync, type SyncStatus } from "~/composables/useSync"
import { useTerminalTheme } from "~/composables/useTerminalTheme"
import { useSettings, ANIMATION_SPEED_LABELS } from "~/composables/useSettings"
import { useNodes } from "~/composables/useNodes"
import { useVault } from "~/composables/useVault"
import { useDialog } from "~/composables/useDialog"
import { useVaultBackup } from "~/composables/useVaultBackup"
import ToggleSwitch from "~/components/ToggleSwitch.vue"
import Checkbox from "~/components/Checkbox.vue"
import type { AnimationSpeed } from "~/composables/useSettings"

const props = defineProps<{
    vaultReady: boolean
}>()

const emit = defineEmits<{
    (e: "open-add-modal"): void
    (e: "unlock-vault"): void
}>()

const { currentThemeName, themes } = useTerminalTheme()
const { settings, DEFAULT_SETTINGS, replaceSettings } = useSettings()
const { nodes: tunnelNodes, fetchNodes } = useNodes()
const { user } = useAuth()
const { masterPassword } = useVault()
const {
    servers,
    refreshServers,
    replaceAll: replaceServers,
} = useServers(masterPassword)
const { snippets, refreshSnippets, replaceAll: replaceSnippets } = useSnippets()
const settingsSync = useSync(masterPassword)
const serversSync = useSync(masterPassword)
const snippetsSync = useSync(masterPassword)

const animationSpeedOptions = Object.entries(ANIMATION_SPEED_LABELS) as [
    AnimationSpeed,
    string,
][]

const handleUnlock = () => emit("unlock-vault")

onMounted(async () => {
    await refreshServers()
    await refreshSnippets()
    await fetchNodes()
})

const isPro = computed(() => {
    const tier = user.value?.subscriptionTier ?? "free"
    return tier !== "free"
})

const syncAvailable = computed(() => isPro.value && props.vaultReady)

const syncBlockedMessage = computed(() => {
    if (!user.value) {
        return "Sign in with a Pro or Team account to sync encrypted data."
    }

    if (!isPro.value) {
        return "Cloud sync requires a Pro or Team subscription."
    }

    if (!props.vaultReady) {
        return "Unlock the vault to sync settings, servers, and snippets."
    }

    return ""
})

const formatSyncStatus = (
    status: SyncStatus,
    error: string,
    lastSyncAt: number | null
) => {
    switch (status) {
        case "syncing":
            return "Syncing…"
        case "ok":
            return lastSyncAt
                ? `Synced ${new Date(lastSyncAt).toLocaleTimeString()}`
                : "Synced"
        case "error":
            return error || "Sync error"
        default:
            return "Not synced"
    }
}

const formatSyncColor = (status: SyncStatus) => {
    switch (status) {
        case "syncing":
            return "text-amber-400"
        case "ok":
            return "text-emerald-400"
        case "error":
            return "text-red-400"
        default:
            return "text-secondary"
    }
}

const settingsSyncLabel = computed(() =>
    formatSyncStatus(
        settingsSync.syncStatus.value,
        settingsSync.syncError.value,
        settingsSync.lastSyncAt.value
    )
)

const settingsSyncColor = computed(() =>
    formatSyncColor(settingsSync.syncStatus.value)
)
const settingsSyncBusy = computed(
    () => settingsSync.syncStatus.value === "syncing"
)

const { resetVault } = useVault()
const { showConfirm } = useDialog()
const {
    exportVault,
    importVault,
    exportStatus,
    importStatus,
    exporting,
    importing,
} = useVaultBackup()
const backupImportRef = ref<HTMLInputElement | null>(null)

async function handleImportFile(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    const confirmed = await showConfirm(
        "Importing will overwrite ALL current vault data (servers, snippets, settings). Continue?",
        {
            title: "Import Vault Backup",
            okLabel: "Import",
            cancelLabel: "Cancel",
            maxWidth: "500px",
        }
    )
    if (!confirmed) {
        input.value = ""
        return
    }

    await importVault(file)
    input.value = ""
}

const serversSyncLabel = computed(() =>
    formatSyncStatus(
        serversSync.syncStatus.value,
        serversSync.syncError.value,
        serversSync.lastSyncAt.value
    )
)

const serversSyncColor = computed(() =>
    formatSyncColor(serversSync.syncStatus.value)
)
const serversSyncBusy = computed(
    () => serversSync.syncStatus.value === "syncing"
)

const snippetsSyncLabel = computed(() =>
    formatSyncStatus(
        snippetsSync.syncStatus.value,
        snippetsSync.syncError.value,
        snippetsSync.lastSyncAt.value
    )
)

const snippetsSyncColor = computed(() =>
    formatSyncColor(snippetsSync.syncStatus.value)
)
const snippetsSyncBusy = computed(
    () => snippetsSync.syncStatus.value === "syncing"
)

const handlePushSettings = async () => {
    await settingsSync.pushSettings(settings.value)
}

const handlePullSettings = async () => {
    const incoming = await settingsSync.pullSettings()
    if (incoming) {
        replaceSettings(incoming)
    }
}

const handlePushServers = async () => {
    await refreshServers()
    await serversSync.pushServers(servers.value)
}

const handlePullServers = async () => {
    const incoming = await serversSync.pullServers()
    if (incoming) {
        await replaceServers(incoming)
    }
}

const handlePushSnippets = async () => {
    await refreshSnippets()
    await snippetsSync.pushSnippets(snippets.value)
}

const handlePullSnippets = async () => {
    const incoming = await snippetsSync.pullSnippets()
    if (incoming) {
        await replaceSnippets(incoming)
    }
}

const handleResetVault = async () => {
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
</script>

<template>
    <div class="flex flex-col gap-8 p-8 max-w-3xl mx-auto">
        <div>
            <h1 class="text-4xl font-bold text-white tracking-tight">
                Settings
            </h1>
            <p class="mt-2 text-secondary">
                Application and terminal preferences.
            </p>
        </div>

        <SettingsSection title="Appearance">
            <SettingsRow label="Theme" description="Terminal color scheme.">
                <select
                    v-model="currentThemeName"
                    class="ws-input py-1.5 px-3 text-xs min-w-32"
                >
                    <option
                        v-for="theme in themes"
                        :key="theme.name"
                        :value="theme.name"
                    >
                        {{ theme.name }}
                    </option>
                </select>
            </SettingsRow>

            <SettingsRow
                label="Animations"
                description="Enable UI transition animations."
            >
                <ToggleSwitch
                    v-model="settings.animationsEnabled"
                    aria-label="Enable UI transition animations"
                />
            </SettingsRow>

            <SettingsRow
                label="Animation Speed"
                description="Duration of UI transitions."
                :disabled="!settings.animationsEnabled"
            >
                <select
                    v-model="settings.animationSpeed"
                    class="ws-input py-1.5 px-3 text-xs min-w-32"
                >
                    <option
                        v-for="[value, label] in animationSpeedOptions"
                        :key="value"
                        :value="value"
                    >
                        {{ label }}
                    </option>
                </select>
            </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Cloud Sync">
            <SettingsRow
                label="Autosync"
                description="Automatically push local settings, servers, and snippets after edits."
            >
                <ToggleSwitch
                    v-model="settings.autoSyncEnabled"
                    aria-label="Enable autosync"
                />
            </SettingsRow>

            <template v-if="syncAvailable">
                <SettingsRow
                    label="Settings"
                    description="Push or pull appearance and terminal preferences."
                >
                    <div class="flex items-center gap-2">
                        <span
                            :class="[
                                'text-xxs min-w-24 text-right',
                                settingsSyncColor,
                            ]"
                        >
                            {{ settingsSyncLabel }}
                        </span>
                        <button
                            class="ws-btn px-3 py-1.5 text-xxs"
                            :disabled="settingsSyncBusy"
                            @click="handlePushSettings"
                        >
                            ↑ Push
                        </button>
                        <button
                            class="ws-btn px-3 py-1.5 text-xxs"
                            :disabled="settingsSyncBusy"
                            @click="handlePullSettings"
                        >
                            ↓ Pull
                        </button>
                    </div>
                </SettingsRow>

                <SettingsRow
                    label="Snippets"
                    :description="`${snippets.length} local snippet(s)`"
                >
                    <div class="flex items-center gap-2">
                        <span
                            :class="[
                                'text-xxs min-w-24 text-right',
                                snippetsSyncColor,
                            ]"
                        >
                            {{ snippetsSyncLabel }}
                        </span>
                        <button
                            class="ws-btn px-3 py-1.5 text-xxs"
                            :disabled="snippetsSyncBusy"
                            @click="handlePushSnippets"
                        >
                            ↑ Push
                        </button>
                        <button
                            class="ws-btn px-3 py-1.5 text-xxs"
                            :disabled="snippetsSyncBusy"
                            @click="handlePullSnippets"
                        >
                            ↓ Pull
                        </button>
                    </div>
                </SettingsRow>

                <SettingsRow
                    label="Servers"
                    :description="`${servers.length} local profile(s)`"
                >
                    <div class="flex items-center gap-2">
                        <span
                            :class="[
                                'text-xxs min-w-24 text-right',
                                serversSyncColor,
                            ]"
                        >
                            {{ serversSyncLabel }}
                        </span>
                        <button
                            class="ws-btn px-3 py-1.5 text-xxs"
                            :disabled="serversSyncBusy"
                            @click="handlePushServers"
                        >
                            ↑ Push
                        </button>
                        <button
                            class="ws-btn px-3 py-1.5 text-xxs"
                            :disabled="serversSyncBusy"
                            @click="handlePullServers"
                        >
                            ↓ Pull
                        </button>
                    </div>
                </SettingsRow>
            </template>

            <SettingsRow
                v-else
                label="Availability"
                :description="syncBlockedMessage"
            />
        </SettingsSection>

        <SettingsSection title="Backup">
            <SettingsRow
                label="Export Vault"
                description="Download an encrypted backup of all server profiles and snippets. The file requires your master password to use."
            >
                <div class="flex items-center gap-2">
                    <span
                        v-if="exportStatus"
                        class="text-xxs text-emerald-400 max-w-48 text-right truncate"
                    >
                        {{ exportStatus }}
                    </span>
                    <button
                        class="ws-btn px-3 py-1.5 text-xxs"
                        :disabled="exporting"
                        @click="exportVault"
                    >
                        {{ exporting ? "Exporting…" : "↓ Export" }}
                    </button>
                </div>
            </SettingsRow>

            <SettingsRow
                label="Import Vault"
                description="Restore from a previously exported backup file. This will overwrite your current vault."
            >
                <div class="flex items-center gap-2">
                    <span
                        v-if="importStatus"
                        class="text-xxs max-w-48 text-right truncate"
                        :class="
                            importStatus.includes('failed')
                                ? 'text-red-400'
                                : 'text-emerald-400'
                        "
                    >
                        {{ importStatus }}
                    </span>
                    <button
                        class="ws-btn px-3 py-1.5 text-xxs"
                        :disabled="importing"
                        @click="backupImportRef?.click()"
                    >
                        {{ importing ? "Importing…" : "↑ Import" }}
                    </button>
                    <input
                        ref="backupImportRef"
                        type="file"
                        accept=".json"
                        class="hidden"
                        @change="handleImportFile"
                    />
                </div>
            </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Security">
            <SettingsRow
                v-if="!props.vaultReady"
                label="Vault"
                description="Unlock the vault to access stored credentials."
            >
                <button class="ws-btn" @click="handleUnlock">
                    Unlock Vault
                </button>
            </SettingsRow>

            <SettingsRow
                label="Reset Vault"
                description="Erase all vault data, settings, servers, and snippets."
            >
                <button
                    class="ws-btn bg-red-600 text-white hover:bg-red-700"
                    @click="handleResetVault"
                >
                    Reset Vault
                </button>
            </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Privacy">
            <SettingsRow
                label="Hide Sensitive Data"
                description="Mask IP addresses and hostnames in the UI"
            >
                <Checkbox
                    v-model="settings.hideSensitive"
                    aria-label="Hide sensitive host data"
                >
                    Hide Sensitive Data
                </Checkbox>
            </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Network / Tunnel Relay">
            <SettingsRow
                label="Preferred Node"
                description="Choose a specific relay node to use. If not set, the fastest node is chosen automatically by the backend."
            >
                <select
                    v-model="settings.preferredNode"
                    class="ws-input py-1.5 px-3 text-xs min-w-48"
                >
                    <option :value="null">Automatic</option>
                    <option
                        v-for="node in tunnelNodes"
                        :key="node.name"
                        :value="node.name"
                    >
                        {{ node.name }}
                    </option>
                </select>
            </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Terminal">
            <SettingsRow
                label="Font Size"
                description="Terminal font size (px)"
            >
                <input
                    type="number"
                    v-model.number="settings.fontSize"
                    min="8"
                    max="40"
                    class="ws-input py-1.5 px-3 text-xs w-24"
                />
            </SettingsRow>

            <SettingsRow
                label="Font Family"
                description="Preferred monospace fonts"
            >
                <select
                    v-model="settings.fontFamily"
                    class="ws-input py-1.5 px-3 text-xs min-w-32"
                >
                    <option :value="DEFAULT_SETTINGS.fontFamily">
                        JetBrains Mono (preferred)
                    </option>
                    <option value="'Fira Code', ui-monospace, monospace">
                        Fira Code
                    </option>
                    <option value="'Cascadia Code', ui-monospace, monospace">
                        Cascadia Code
                    </option>
                    <option value="'IBM Plex Mono', ui-monospace, monospace">
                        IBM Plex Mono
                    </option>
                    <option value="ui-monospace, monospace">
                        System Monospace
                    </option>
                </select>
            </SettingsRow>

            <SettingsRow
                label="Letter Spacing"
                description="Additional spacing between characters"
            >
                <input
                    type="number"
                    step="0.01"
                    v-model.number="settings.letterSpacing"
                    min="0"
                    max="2"
                    class="ws-input py-1.5 px-3 text-xs w-24"
                />
            </SettingsRow>

            <SettingsRow
                label="Cursor Blink"
                description="Enable blinking cursor"
            >
                <input
                    type="checkbox"
                    v-model="settings.cursorBlink"
                    class="ml-2"
                />
            </SettingsRow>
        </SettingsSection>
    </div>
</template>

<style scoped></style>

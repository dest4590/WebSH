<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useAuth } from "~/composables/useAuth"
import { useSettings } from "~/composables/useSettings"
import { useSnippets } from "~/composables/useSnippets"
import { useVault } from "~/composables/useVault"
import { useServers } from "~/composables/useServers"
import { useSync } from "~/composables/useSync"
import {
    isFileManagerPaneId,
    isSpecialPane,
    useTerminalWorkspace,
} from "~/composables/useTerminalWorkspace"
import { useViewState } from "~/composables/useViewState"
import { useDialog } from "~/composables/useDialog"
import {
    clearPendingPullAfterLogin,
    hasPendingPullAfterLogin,
} from "~/lib/syncState"
import type { AuthType, ServerRecord } from "~/lib/db"
import AddServerModal from "~/components/AddServerModal.vue"
import AppTabBar from "~/components/AppTabBar.vue"
import TerminalLayout from "~/components/TerminalLayout.vue"
import AppHeader from "~/components/AppHeader.vue"
import MainMenu from "~/components/MainMenu.vue"
import Settings from "~/components/Settings.vue"
import Snippets from "~/components/Snippets.vue"
import FileManager from "~/components/FileManager.vue"
import {
    disposeSharedFileManager,
    useFileManager,
} from "~/composables/useFileManager"

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

const {
    masterPassword,
    vaultReady,
    refreshVaultState,
    unlockVault,
    lockVault,
    resetAutoLockTimer,
} = useVault()
const { showConfirm, showAlert } = useDialog()

const {
    servers,
    refreshServers,
    saveServer,
    prepareEditServer,
    removeServer,
    toggleBookmark,
    importSshFolder,
    replaceAll: replaceServers,
} = useServers(masterPassword)
const { snippets, refreshSnippets, replaceAll: replaceSnippets } = useSnippets()
const { settings, replaceSettings } = useSettings()
const settingsSync = useSync(masterPassword)
const serversSync = useSync(masterPassword)
const snippetsSync = useSync(masterPassword)

const {
    layoutRoot,
    layoutLeafIds,
    focusedTerminalId,
    orderedSessions,
    ensureInitialized,
    focusTerminal,
    setActiveTab,
    reorderTab,
    placeSession,
    connectSessionToServer,
    splitVertical,
    splitHorizontal,
    closePane,
    closeAllPanes,
    resetToTerminal,
    updateSplitPercentage,
} = useTerminalWorkspace(masterPassword)

const {
    activeOverlay,
    activeFileManagerPane,
    showMainMenu,
    showSettings,
    showSnippets,
    showFileManager,
    settingsPane,
    snippetsPane,
    fileManagerPanes,
    handleMainMenuClick,
    handleSettingsTabClick,
    handleSnippetsTabClick,
    handleFileManagerTabClick,
    handleOpenFiles,
    closeFileManagerPane,
    handleSelectSession: viewHandleSelectSession,
    onSessionsEmpty,
    onTileSpecialPane,
    clearOverlay,
} = useViewState(layoutLeafIds, focusedTerminalId, focusTerminal)

const { user, logout, restoreSession } = useAuth()

type AutoSyncTarget = "settings" | "servers" | "snippets"

const AUTO_SYNC_DELAY_MS = 5 * 60 * 1000 // 5 minutes
const autoSyncReady = ref(false)
const applyingRemoteSync = ref(false)
const autoSyncTimers: Partial<
    Record<AutoSyncTarget, ReturnType<typeof setTimeout>>
> = {}

const sessionList = computed(() => orderedSessions.value)

const showAddModal = ref(false)
const addServerModalRef = ref<InstanceType<typeof AddServerModal> | null>(null)
const importInputRef = ref<HTMLInputElement | null>(null)
const editingServerId = ref<number | null>(null)
const editingServerForm = ref<ServerFormFields | null>(null)

const focusedServer = computed(() => {
    const id = focusedTerminalId.value
    if (!id) return null
    const session = orderedSessions.value.find((s) => s.id === id)
    if (!session?.serverId) return null
    return servers.value.find((s) => s.id === session.serverId) ?? null
})

const handleTransferFile = async (payload: {
    fromServer: ServerRecord
    fromPath: string
    fromName: string
    toServer: ServerRecord
}) => {
    const mp = masterPassword as unknown as import("vue").Ref<string>
    const srcFm = useFileManager(mp)
    const dstFm = useFileManager(mp)
    try {
        await srcFm.openFor(payload.fromServer)
        await dstFm.openFor(payload.toServer)
        const bytes = await srcFm.readRemoteFileBytes(payload.fromPath)
        const destDir = dstFm.currentPath.value
        const dest = `${destDir === "/" ? "" : destDir}/${payload.fromName}`
        await dstFm.writeRemoteFileBytes(dest, bytes)
    } catch (e) {
        console.error("Transfer failed", e)
    } finally {
        await srcFm.closeSession()
        await dstFm.closeSession()
    }
}

const handleTabDrop = ({
    sourceId,
    targetId,
    side,
}: {
    sourceId: string
    targetId: string
    side: "left" | "right"
}) => {
    if (isSpecialPane(sourceId) || isSpecialPane(targetId)) {
        placeSession(sourceId, targetId, side)
        onTileSpecialPane()
        return
    }
    reorderTab(sourceId, targetId, side === "left")
}

const handleSelectSession = (sessionId: string) => {
    viewHandleSelectSession(sessionId, setActiveTab)
}

const handleCloseFileManager = async (paneId: string) => {
    closePane(paneId)
    closeFileManagerPane(paneId)
    await disposeSharedFileManager(paneId)
}

watch(sessionList, (newList) => {
    if (newList.length === 0) {
        onSessionsEmpty()
    }
})

const canAutoSync = computed(() => {
    const tier = user.value?.subscriptionTier ?? "free"
    return (
        autoSyncReady.value &&
        !applyingRemoteSync.value &&
        tier !== "free" &&
        vaultReady.value &&
        Boolean(masterPassword.value.trim()) &&
        settings.value.autoSyncEnabled
    )
})

const clearAutoSyncTimer = (target: AutoSyncTarget) => {
    const timer = autoSyncTimers[target]
    if (timer) {
        clearTimeout(timer)
        delete autoSyncTimers[target]
    }
}

const clearAllAutoSyncTimers = () => {
    clearAutoSyncTimer("settings")
    clearAutoSyncTimer("servers")
    clearAutoSyncTimer("snippets")
}

const runAutoSync = async (target: AutoSyncTarget) => {
    if (!canAutoSync.value) return

    switch (target) {
        case "settings":
            await settingsSync.pushSettings(settings.value)
            return
        case "servers":
            await refreshServers()
            await serversSync.pushServers(servers.value)
            return
        case "snippets":
            await refreshSnippets()
            await snippetsSync.pushSnippets(snippets.value)
            return
    }
}

const scheduleAutoSync = (target: AutoSyncTarget) => {
    if (!canAutoSync.value) return
    clearAutoSyncTimer(target)
    autoSyncTimers[target] = setTimeout(() => {
        delete autoSyncTimers[target]
        void runAutoSync(target)
    }, AUTO_SYNC_DELAY_MS)
}

const markAutoSyncReady = () => {
    if (!hasPendingPullAfterLogin()) {
        autoSyncReady.value = true
    }
}

const runPendingLoginPull = async () => {
    if (!hasPendingPullAfterLogin()) {
        markAutoSyncReady()
        return
    }

    if (!vaultReady.value || !masterPassword.value.trim()) return

    applyingRemoteSync.value = true
    clearAllAutoSyncTimers()

    try {
        const [incomingSettings, incomingServers, incomingSnippets] =
            await Promise.all([
                settingsSync.pullSettings(),
                serversSync.pullServers(),
                snippetsSync.pullSnippets(),
            ])

        if (incomingSettings) replaceSettings(incomingSettings)
        if (incomingServers) await replaceServers(incomingServers)
        if (incomingSnippets) await replaceSnippets(incomingSnippets)

        const firstError =
            settingsSync.syncError.value ||
            serversSync.syncError.value ||
            snippetsSync.syncError.value

        if (firstError) {
            await showAlert(firstError, {
                title: "Cloud Sync",
                maxWidth: "520px",
            })
        }
    } finally {
        clearPendingPullAfterLogin()
        applyingRemoteSync.value = false
        autoSyncReady.value = true
    }
}

watch(settings, () => scheduleAutoSync("settings"), { deep: true })
watch(servers, () => scheduleAutoSync("servers"), { deep: true })
watch(snippets, () => scheduleAutoSync("snippets"), { deep: true })

watch(canAutoSync, (enabled) => {
    if (!enabled) clearAllAutoSyncTimers()
})

watch(
    () => settings.value.autoSyncEnabled,
    (enabled, previous) => {
        if (!enabled) {
            clearAllAutoSyncTimers()
            return
        }
        if (enabled && previous === false && autoSyncReady.value) {
            scheduleAutoSync("settings")
            scheduleAutoSync("servers")
            scheduleAutoSync("snippets")
        }
    }
)

const ensureVaultUnlocked = async () => {
    if (!vaultReady.value) await handleUnlockVault()
    return vaultReady.value
}

const handleConnectInTerminal = async ({
    terminalId,
    server,
}: {
    terminalId: string
    server: ServerRecord
}) => {
    if (!(await ensureVaultUnlocked())) return
    await connectSessionToServer(terminalId, server)
}

const handleConnect = async (server: ServerRecord) => {
    if (!(await ensureVaultUnlocked())) return
    await connectSessionToServer(null, server)
    clearOverlay()
}

const handleRemoveServer = async (id: number) => {
    const confirmed = await showConfirm(
        "Delete this server profile? This cannot be undone.",
        { title: "Confirm Delete", okLabel: "Delete", cancelLabel: "Cancel" }
    )
    if (!confirmed) return
    await removeServer(id)
}

const handleEditServer = async (server: ServerRecord) => {
    if (!(await ensureVaultUnlocked())) return
    const formData = await prepareEditServer(server.id!)
    if (!formData) return
    editingServerId.value = server.id!
    editingServerForm.value = formData
    showAddModal.value = true
}

const handleUnlockVault = async () => {
    if (await unlockVault()) {
        await Promise.all([refreshServers(), refreshSnippets()])
        await runPendingLoginPull()
        markAutoSyncReady()
    }
}

const handleLockVault = () => lockVault()

const handleLogout = async () => {
    closeAllPanes()
    await Promise.all(
        fileManagerPanes.value.map((pane) => disposeSharedFileManager(pane.id))
    )
    fileManagerPanes.value.forEach((pane) => closeFileManagerPane(pane.id))
    clearAllAutoSyncTimers()
    clearPendingPullAfterLogin()
    autoSyncReady.value = false
    await logout()
    activeOverlay.value = "menu"
}

const handleOpenLogin = async () => {
    await navigateTo({ path: "/login", query: { redirect: "/app" } })
}

const handleUserActivity = () => resetAutoLockTimer()

const handleToggleBookmark = async (id: number) => toggleBookmark(id)

const handleOpenAddModal = async () => {
    if (!(await ensureVaultUnlocked())) return
    showAddModal.value = true
}

const handleOpenImportSshFolder = async () => {
    if (!(await ensureVaultUnlocked())) return
    importInputRef.value?.click()
}

const handleSshFolderSelected = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const files = input.files
    if (!files || files.length === 0) return
    await importSshFolder(files)
    input.value = ""
}

const handleCloseAddModal = () => {
    showAddModal.value = false
    editingServerId.value = null
    editingServerForm.value = null
}

const handleSaveFromModal = async () => {
    const formData = addServerModalRef.value?.form
    if (!formData) return
    await saveServer(editingServerId.value ?? undefined, formData)
    editingServerId.value = null
    editingServerForm.value = null
    showAddModal.value = false
}

const handleSplitVertical = () => {
    if (focusedTerminalId.value) splitVertical(focusedTerminalId.value)
}

const handleSplitHorizontal = () => {
    if (focusedTerminalId.value) splitHorizontal(focusedTerminalId.value)
}

const handleResetLayout = () => {
    if (focusedTerminalId.value) resetToTerminal(focusedTerminalId.value)
}

const handleCloseFocusedPane = () => {
    if (focusedTerminalId.value) closePane(focusedTerminalId.value)
}

const handleLayoutResize = (payload: {
    nodeId: string
    splitPercentage: number
}) => {
    updateSplitPercentage(payload.nodeId, payload.splitPercentage)
}

onMounted(async () => {
    ensureInitialized()
    await restoreSession()
    await refreshVaultState()
    await Promise.all([refreshServers(), refreshSnippets()])
    await runPendingLoginPull()
    markAutoSyncReady()

    window.addEventListener("mousemove", handleUserActivity)
    window.addEventListener("keydown", handleUserActivity)
    window.addEventListener("mousedown", handleUserActivity)
    window.addEventListener("touchstart", handleUserActivity)
    window.addEventListener("scroll", handleUserActivity)
})

onBeforeUnmount(() => {
    clearAllAutoSyncTimers()
    window.removeEventListener("mousemove", handleUserActivity)
    window.removeEventListener("keydown", handleUserActivity)
    window.removeEventListener("mousedown", handleUserActivity)
    window.removeEventListener("touchstart", handleUserActivity)
    window.removeEventListener("scroll", handleUserActivity)
})
</script>

<template>
    <div
        class="h-screen flex flex-col bg-black text-white font-mono overflow-hidden"
    >
        <AppHeader :showAppButton="false" :showHomeButton="false">
            <template #right>
                <button
                    v-if="!vaultReady"
                    class="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors group"
                    title="Unlock Vault"
                    @click="handleUnlockVault"
                >
                    <span
                        class="text-xxs text-yellow-500/70 group-hover:text-yellow-400"
                        >vault locked</span
                    >
                </button>
                <div v-if="vaultReady" class="flex items-center gap-2">
                    <button
                        type="button"
                        class="ws-btn px-3 py-1.5 text-xxs"
                        title="Lock Vault"
                        @click="handleLockVault"
                    >
                        Lock Vault
                    </button>
                </div>
                <button
                    v-if="!user"
                    type="button"
                    class="ws-btn px-3 py-1.5 text-xxs"
                    title="Sign In"
                    @click="handleOpenLogin"
                >
                    Sign In
                </button>
                <button
                    v-else
                    type="button"
                    class="ws-btn px-3 py-1.5 text-xxs"
                    title="Sign Out"
                    @click="handleLogout"
                >
                    Sign Out
                </button>
            </template>
        </AppHeader>

        <div class="flex flex-1 min-h-0">
            <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
                <AppTabBar
                    :session-list="sessionList"
                    :layout-leaf-ids="layoutLeafIds"
                    :focused-terminal-id="focusedTerminalId"
                    :active-overlay="activeOverlay"
                    :settings-pane="settingsPane"
                    :snippets-pane="snippetsPane"
                    :file-manager-panes="fileManagerPanes"
                    :vault-ready="vaultReady"
                    @openMainMenu="handleMainMenuClick"
                    @openSettings="handleSettingsTabClick"
                    @openSnippets="handleSnippetsTabClick"
                    @openFileManager="handleFileManagerTabClick"
                    @closeFileManager="handleCloseFileManager"
                    @selectSession="handleSelectSession"
                    @closeSession="closePane"
                    @requestNewConnection="handleMainMenuClick"
                    @tabDrop="handleTabDrop"
                />

                <div
                    v-if="
                        activeFileManagerPane !== null &&
                        !activeFileManagerPane.inView
                    "
                    v-show="showFileManager"
                    class="flex-1 overflow-y-auto"
                >
                    <FileManager
                        :server="activeFileManagerPane.server"
                        :manager-key="activeFileManagerPane.id"
                        :master-password="
                            masterPassword as unknown as import('vue').Ref<string>
                        "
                    />
                </div>

                <div v-if="showMainMenu" class="flex-1 overflow-y-auto">
                    <MainMenu
                        ref="mainMenuRef"
                        :servers="servers"
                        :vault-ready="vaultReady"
                        @connect="handleConnect"
                        @toggle-bookmark="handleToggleBookmark"
                        @edit="handleEditServer"
                        @remove="handleRemoveServer"
                        @open-add-modal="handleOpenAddModal"
                        @open-import-ssh-folder="handleOpenImportSshFolder"
                        @unlock-vault="handleUnlockVault"
                        @openFiles="handleOpenFiles"
                        @transferFile="handleTransferFile"
                    />
                </div>

                <div v-else-if="showSettings" class="flex-1 overflow-y-auto">
                    <Settings
                        :vault-ready="vaultReady"
                        @unlock-vault="handleUnlockVault"
                    />
                </div>

                <div v-else-if="showSnippets" class="flex-1 overflow-hidden">
                    <Snippets
                        :ordered-sessions="orderedSessions"
                        :master-password="masterPassword"
                        :vault-ready="vaultReady"
                    />
                </div>

                <TerminalLayout
                    v-if="
                        !showMainMenu &&
                        !showSettings &&
                        !showSnippets &&
                        !showFileManager
                    "
                    :root="layoutRoot"
                    :servers="servers"
                    :vault-ready="vaultReady"
                    :focused-terminal-id="focusedTerminalId"
                    :master-password="masterPassword"
                    :file-manager-panes="fileManagerPanes"
                    @focus="focusTerminal"
                    @connect="handleConnectInTerminal"
                    @resize="handleLayoutResize"
                    @unlock-vault="handleUnlockVault"
                    @open-files="handleOpenFiles"
                    @close-file-manager="handleCloseFileManager"
                />
            </div>
        </div>

        <input
            ref="importInputRef"
            type="file"
            webkitdirectory
            directory
            multiple
            class="hidden"
            @change="handleSshFolderSelected"
        />

        <AddServerModal
            ref="addServerModalRef"
            :open="showAddModal"
            :vault-ready="vaultReady"
            :initial-form="editingServerForm"
            :is-editing="!!editingServerId"
            @close="handleCloseAddModal"
            @save="handleSaveFromModal"
        />
    </div>
</template>

import { computed, ref, watch, type Ref } from "vue"
import { type ServerRecord } from "~/lib/db"
import {
    createFileManagerPaneId,
    SETTINGS_PANE_ID,
    SNIPPETS_PANE_ID,
    isFileManagerPaneId,
    isSpecialPane,
} from "./useTerminalWorkspace"

export type OverlayView =
    | "menu"
    | "settings"
    | "snippets"
    | "fileManager"
    | null

export interface SpecialPaneState {
    id: string
    active: boolean
    inView: boolean
}

export interface FileManagerPaneState extends SpecialPaneState {
    server: ServerRecord
    serverName: string
}

export function useViewState(
    layoutLeafIds: Ref<string[]>,
    focusedTerminalId: Ref<string | null>,
    focusTerminal: (id: string) => void
) {
    const activeOverlay = ref<OverlayView>("menu")
    const activeFileManagerPaneId = ref<string | null>(null)
    const fileManagerServers = ref<Record<string, ServerRecord>>({})

    const showMainMenu = computed(() => activeOverlay.value === "menu")
    const showSettings = computed(() => activeOverlay.value === "settings")
    const showSnippets = computed(() => activeOverlay.value === "snippets")
    const showFileManager = computed(
        () =>
            activeOverlay.value === "fileManager" &&
            activeFileManagerPaneId.value !== null
    )

    const fileManagerPanes = computed<FileManagerPaneState[]>(() =>
        Object.entries(fileManagerServers.value).map(([id, server]) => {
            const inView = layoutLeafIds.value.includes(id)
            const focused = focusedTerminalId.value === id
            return {
                id,
                server,
                serverName: server.name,
                inView,
                active:
                    focused ||
                    (showFileManager.value &&
                        activeFileManagerPaneId.value === id),
            }
        })
    )

    const activeFileManagerPane = computed<FileManagerPaneState | null>(
        () =>
            fileManagerPanes.value.find(
                (pane) => pane.id === activeFileManagerPaneId.value
            ) ?? null
    )

    const clearOverlay = () => {
        activeOverlay.value = null
    }

    const settingsPane = computed<SpecialPaneState>(() => {
        const inView = layoutLeafIds.value.includes(SETTINGS_PANE_ID)
        const focused = focusedTerminalId.value === SETTINGS_PANE_ID
        return {
            id: SETTINGS_PANE_ID,
            inView,
            active: showSettings.value || focused,
        }
    })

    const snippetsPane = computed<SpecialPaneState>(() => {
        const inView = layoutLeafIds.value.includes(SNIPPETS_PANE_ID)
        const focused = focusedTerminalId.value === SNIPPETS_PANE_ID
        return {
            id: SNIPPETS_PANE_ID,
            inView,
            active: showSnippets.value || focused,
        }
    })

    const handleSpecialPaneClick = (
        paneId: string,
        overlayKey: Exclude<OverlayView, "menu" | null>,
        onClose?: () => void
    ) => {
        if (layoutLeafIds.value.includes(paneId)) {
            clearOverlay()
            focusTerminal(paneId)
            return
        }
        if (activeOverlay.value === overlayKey) {
            onClose?.()
            clearOverlay()
            return
        }
        activeOverlay.value = overlayKey
    }

    const handleSettingsTabClick = () =>
        handleSpecialPaneClick(SETTINGS_PANE_ID, "settings")

    const handleSnippetsTabClick = () =>
        handleSpecialPaneClick(SNIPPETS_PANE_ID, "snippets")

    const handleFileManagerTabClick = (paneId: string) => {
        if (!(paneId in fileManagerServers.value)) return
        if (layoutLeafIds.value.includes(paneId)) {
            clearOverlay()
            focusTerminal(paneId)
            return
        }
        activeFileManagerPaneId.value = paneId
        activeOverlay.value = "fileManager"
    }

    const handleMainMenuClick = () => {
        activeOverlay.value = "menu"
    }

    const handleOpenFiles = (server: ServerRecord) => {
        const paneId = createFileManagerPaneId()
        fileManagerServers.value = {
            ...fileManagerServers.value,
            [paneId]: server,
        }
        activeFileManagerPaneId.value = paneId
        activeOverlay.value = "fileManager"
    }

    const closeFileManagerPane = (paneId: string) => {
        if (!(paneId in fileManagerServers.value)) return

        const paneIds = Object.keys(fileManagerServers.value)
        const nextPaneId = paneIds.find((id) => id !== paneId) ?? null
        const { [paneId]: _, ...remaining } = fileManagerServers.value
        fileManagerServers.value = remaining

        if (activeFileManagerPaneId.value !== paneId) {
            return
        }

        activeFileManagerPaneId.value = nextPaneId
        if (activeOverlay.value === "fileManager") {
            activeOverlay.value = nextPaneId ? "fileManager" : null
        }
    }

    const handleSelectSession = (
        sessionId: string,
        setActiveTab: (id: string) => void
    ) => {
        clearOverlay()
        setActiveTab(sessionId)
    }

    watch(focusedTerminalId, (id) => {
        if (!id || !isFileManagerPaneId(id)) return
        activeFileManagerPaneId.value = id
    })

    const onSessionsEmpty = () => {
        activeOverlay.value = "menu"
    }

    const onTileSpecialPane = () => {
        clearOverlay()
    }

    return {
        activeOverlay,
        activeFileManagerPaneId,
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
        handleSelectSession,
        onSessionsEmpty,
        onTileSpecialPane,
        clearOverlay,
    }
}

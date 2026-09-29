<script setup lang="ts">
import { ref } from "vue"
import {
    useTerminalWorkspace,
    type TerminalSession,
} from "~/composables/useTerminalWorkspace"
import {
    type FileManagerPaneState,
    type OverlayView,
    type SpecialPaneState,
} from "~/composables/useViewState"

type DragSide = "left" | "right"

const props = defineProps<{
    sessionList: TerminalSession[]
    layoutLeafIds: string[]
    focusedTerminalId: string | null
    activeOverlay: OverlayView
    settingsPane: SpecialPaneState
    snippetsPane: SpecialPaneState
    fileManagerPanes: FileManagerPaneState[]
    vaultReady: boolean
}>()

const emit = defineEmits<{
    (e: "openMainMenu"): void
    (e: "openSettings"): void
    (e: "openSnippets"): void
    (e: "openFileManager", paneId: string): void
    (e: "closeFileManager", paneId: string): void
    (e: "selectSession", sessionId: string): void
    (e: "closeSession", sessionId: string): void
    (e: "requestNewConnection"): void
    (
        e: "tabDrop",
        payload: { sourceId: string; targetId: string; side: DragSide }
    ): void
}>()

const dragOverTabId = ref<string | null>(null)
const dragOverSide = ref<DragSide | null>(null)

const workspace = useTerminalWorkspace()

const isSessionActive = (session: TerminalSession) =>
    props.activeOverlay === null && session.id === props.focusedTerminalId

const getSessionDotClass = (session: TerminalSession) => {
    if (session.ssh.connectionState.value === "connected")
        return "bg-emerald-400"
    if (session.ssh.connectionState.value === "connecting")
        return "bg-amber-400"
    return "bg-zinc-600"
}

const buildDragClasses = (paneId: string) => [
    dragOverTabId.value === paneId && dragOverSide.value === "left"
        ? "terminal-tab-drop-before"
        : "",
    dragOverTabId.value === paneId && dragOverSide.value === "right"
        ? "terminal-tab-drop-after"
        : "",
]

const buildSpecialPaneTabClasses = (pane: SpecialPaneState) => [
    pane.active ? "terminal-tab-active" : "",
    !pane.active && pane.inView ? "terminal-tab-in-view" : "",
    ...buildDragClasses(pane.id),
]

const getSessionTabClasses = (session: TerminalSession) => [
    isSessionActive(session) ? "terminal-tab-active" : "",
    props.layoutLeafIds.includes(session.id) ? "terminal-tab-in-view" : "",
    ...buildDragClasses(session.id),
]

const onTabDragStart = (event: DragEvent, sessionId: string) => {
    if (!event.dataTransfer) return
    event.dataTransfer.setData("text/terminal-id", sessionId)
    event.dataTransfer.effectAllowed = "move"
    dragOverTabId.value = sessionId
    workspace.draggingTerminalId.value = sessionId
}

const onTabDragEnd = () => {
    dragOverTabId.value = null
    dragOverSide.value = null
    workspace.draggingTerminalId.value = null
}

const onTabDragLeave = () => {
    dragOverTabId.value = null
    dragOverSide.value = null
}

const onTabDragOver = (event: DragEvent, sessionId: string) => {
    event.preventDefault()
    const { left, width } = (
        event.currentTarget as HTMLElement
    ).getBoundingClientRect()
    dragOverTabId.value = sessionId
    dragOverSide.value = (event.clientX - left) / width < 0.5 ? "left" : "right"
}

const onTabDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault()
    const sourceId = event.dataTransfer?.getData("text/terminal-id")
    if (!sourceId || sourceId === targetId) return
    emit("tabDrop", { sourceId, targetId, side: dragOverSide.value ?? "right" })
    dragOverTabId.value = null
    dragOverSide.value = null
    workspace.draggingTerminalId.value = null
}
</script>

<template>
    <div class="border-b border-(--border) shrink-0 bg-(--surface-alt)">
        <div
            class="flex h-10 items-center min-w-0 overflow-x-auto scrollbar-hide"
        >
            <div
                class="terminal-tab group shrink-0"
                :class="activeOverlay === 'menu' ? 'terminal-tab-active' : ''"
                @click="emit('openMainMenu')"
            >
                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                <span class="truncate text-xs">Menu</span>
            </div>

            <div
                class="terminal-tab group shrink-0"
                :class="buildSpecialPaneTabClasses(settingsPane)"
                draggable="true"
                @dragstart="(e) => onTabDragStart(e, settingsPane.id)"
                @dragend="onTabDragEnd"
                @dragover.prevent="(e) => onTabDragOver(e, settingsPane.id)"
                @dragleave="onTabDragLeave"
                @drop.prevent="(e) => onTabDrop(e, settingsPane.id)"
                @click="emit('openSettings')"
            >
                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
                <span class="truncate text-xs">Settings</span>
            </div>

            <div
                class="terminal-tab group shrink-0"
                :class="buildSpecialPaneTabClasses(snippetsPane)"
                draggable="true"
                @dragstart="(e) => onTabDragStart(e, snippetsPane.id)"
                @dragend="onTabDragEnd"
                @dragover.prevent="(e) => onTabDragOver(e, snippetsPane.id)"
                @dragleave="onTabDragLeave"
                @drop.prevent="(e) => onTabDrop(e, snippetsPane.id)"
                @click="emit('openSnippets')"
            >
                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span class="truncate text-xs">Snippets</span>
            </div>

            <div
                v-for="pane in fileManagerPanes"
                :key="pane.id"
                class="terminal-tab group shrink-0"
                :class="buildSpecialPaneTabClasses(pane)"
                draggable="true"
                @dragstart="(e) => onTabDragStart(e, pane.id)"
                @dragend="onTabDragEnd"
                @dragover.prevent="(e) => onTabDragOver(e, pane.id)"
                @dragleave="onTabDragLeave"
                @drop.prevent="(e) => onTabDrop(e, pane.id)"
                @click="emit('openFileManager', pane.id)"
            >
                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                <span class="truncate text-xs">
                    files | {{ pane.serverName }}
                </span>
                <button
                    class="terminal-session-close ml-1 shrink-0"
                    title="Close files"
                    @mousedown.stop
                    @click.stop="emit('closeFileManager', pane.id)"
                >
                    <span aria-hidden="true" class="text-sm">×</span>
                </button>
            </div>

            <div
                v-for="session in sessionList"
                :key="session.id"
                class="terminal-tab group relative shrink-0"
                :class="getSessionTabClasses(session)"
                draggable="true"
                @dragstart="(e) => onTabDragStart(e, session.id)"
                @dragend="onTabDragEnd"
                @dragover.prevent="(e) => onTabDragOver(e, session.id)"
                @dragleave="onTabDragLeave"
                @drop.prevent="(e) => onTabDrop(e, session.id)"
                @click="emit('selectSession', session.id)"
                @mousedown.middle.prevent.stop
                @click.middle.prevent.stop="emit('closeSession', session.id)"
            >
                <span
                    class="h-1.5 w-1.5 shrink-0 rounded-full"
                    :class="getSessionDotClass(session)"
                />
                <span class="truncate text-xs">{{
                    session.serverName || session.label
                }}</span>
                <button
                    class="terminal-session-close ml-1 shrink-0"
                    title="Close tab"
                    @mousedown.stop
                    @click.stop="emit('closeSession', session.id)"
                >
                    <span aria-hidden="true" class="text-sm">×</span>
                </button>
            </div>

            <button
                v-if="vaultReady"
                class="shrink-0 px-3 h-full hover:text-white hover:bg-white/5 transition-colors border-r border-(--border)"
                title="New connection (go to Main Menu)"
                @click="emit('requestNewConnection')"
            >
                <span aria-hidden="true">+</span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useAttrs, watch, type Ref } from "vue"
import useAnimations from "~/composables/useAnimations"
import Settings from "~/components/Settings.vue"
import Snippets from "~/components/Snippets.vue"
import FileManager from "~/components/FileManager.vue"
import ShareModal from "~/components/ShareModal.vue"
import TerminalWrapper from "~/components/TerminalWrapper.vue"
import {
    SETTINGS_PANE_ID,
    SNIPPETS_PANE_ID,
    isFileManagerPaneId,
    useTerminalWorkspace,
    type LayoutNode,
} from "~/composables/useTerminalWorkspace"
import { useTerminalShare } from "~/composables/useTerminalShare"
import { useDialog } from "~/composables/useDialog"
import { type ServerRecord } from "~/lib/db"

import { type FileManagerPaneState } from "~/composables/useViewState"
import { useSettings } from "~/composables/useSettings"
import { useRouter } from "#app"
import {
    typingBadgeBaseStyle,
    typingBadgeNameStyle,
    typingBadgeVisibleStyle,
    useTypingBadges,
} from "~/composables/useTypingBadges"

defineOptions({
    name: "TerminalNode",
    inheritAttrs: false,
})

const rawAttrs = useAttrs()
const attrs = computed(() => {
    const { onOpenFiles: _, ...rest } = rawAttrs
    return rest
})

const props = defineProps<{
    node: LayoutNode
    servers: ServerRecord[]
    vaultReady: boolean
    focusedTerminalId: string | null
    masterPassword: string | Ref<string>
    fileManagerPanes: FileManagerPaneState[]
}>()

const emit = defineEmits<{
    (e: "focus", terminalId: string): void
    (e: "connect", payload: { terminalId: string; server: ServerRecord }): void
    (e: "resize", payload: { nodeId: string; splitPercentage: number }): void
    (e: "unlock-vault"): void
    (e: "open-files", server: ServerRecord): void
    (e: "close-file-manager", paneId: string): void
}>()

const workspace = useTerminalWorkspace()
const { settings, animationDuration } = useSettings()
const { runFlip, handleClosePane, isClosing } = useAnimations(
    animationDuration,
    settings
)

const share = useTerminalShare()
const showShareModal = ref(false)
const shareReadOnly = ref(true)
const terminalHostRef = ref<HTMLElement | null>(null)

const { typingBadges, applyTypingBadge, clearTypingBadges } = useTypingBadges({
    getCursorPos: () => {
        const term = session.value?.terminal
        if (!term) return null
        return cursorPixelPos(term)
    },
})

const { showConfirm } = useDialog()
const router = useRouter()

async function openShare() {
    if (!session.value) return
    showShareModal.value = true
}

async function handleCreateShare() {
    if (!session.value) return
    await share.startSharing(session.value, {
        readOnly: shareReadOnly.value,
        onExpired: async () => {
            showShareModal.value = true
            const goToPlans = await showConfirm(
                "Your free plan share session has expired after 10 minutes.\nUpgrade to Pro for unlimited terminal sharing.",
                {
                    title: "Share Session Expired",
                    okLabel: "View Plans",
                    cancelLabel: "Dismiss",
                }
            )
            if (goToPlans) {
                router.push("/plans")
            }
        },
    })
}

function stopAndCloseShare() {
    share.stopSharing()
    showShareModal.value = false
}

function cursorPixelPos(term: any): { x: number; y: number } | null {
    if (!term) return null
    const realTerm = term.value ?? term
    const host = terminalHostRef.value
    if (!realTerm || !host) return null
    const cellW = host.offsetWidth / realTerm.cols
    const cellH = host.offsetHeight / realTerm.rows
    return {
        x: realTerm.buffer.active.cursorX * cellW,
        y: realTerm.buffer.active.cursorY * cellH,
    }
}

watch(
    () => share.typingEvents.value.length,
    (newLen) => {
        if (newLen <= 0) return
        const event =
            share.typingEvents.value[share.typingEvents.value.length - 1]
        if (event) {
            applyTypingBadge(event.from)
        }
    }
)

const splitContainer = ref<HTMLElement | null>(null)
const isResizing = ref(false)
let stopResize: (() => void) | null = null

const isSettingsPane = computed(
    () => props.node.terminalId === SETTINGS_PANE_ID
)
const isSnippetsPane = computed(
    () => props.node.terminalId === SNIPPETS_PANE_ID
)
const fileManagerPane = computed(
    () =>
        props.fileManagerPanes.find(
            (pane) => pane.id === props.node.terminalId
        ) ?? null
)
const isFileManagerPane = computed(
    () => !!props.node.terminalId && isFileManagerPaneId(props.node.terminalId)
)

const session = computed(() => {
    if (
        props.node.type !== "leaf" ||
        !props.node.terminalId ||
        isSettingsPane.value ||
        isSnippetsPane.value ||
        isFileManagerPane.value
    ) {
        return null
    }

    return workspace.sessions.get(props.node.terminalId) ?? null
})

const isFocused = computed(
    () =>
        props.node.type === "leaf" &&
        props.focusedTerminalId === props.node.terminalId
)

const splitPercentage = computed(() => props.node.splitPercentage ?? 0.5)
const isVerticalSplit = computed(() => props.node.direction === "vertical")
const splitTrackStyle = computed(() => {
    const primary = Math.round(splitPercentage.value * 1000)
    const secondary = 1000 - primary

    return isVerticalSplit.value
        ? { gridTemplateColumns: `${primary}fr 4px ${secondary}fr` }
        : { gridTemplateRows: `${primary}fr 4px ${secondary}fr` }
})

const showTerminal = computed(
    () =>
        !!session.value &&
        (session.value.hasConnectionHistory ||
            session.value.ssh.connectionState.value !== "offline")
)

const sessionLabel = computed(() => {
    if (isSettingsPane.value) {
        return "Settings"
    }

    if (isSnippetsPane.value) {
        return "Snippets"
    }

    if (isFileManagerPane.value) {
        return fileManagerPane.value?.serverName
            ? `Files | ${fileManagerPane.value.serverName}`
            : "Files"
    }

    if (!session.value) {
        return "Terminal"
    }

    return session.value.serverName || session.value.label
})

const sessionStatus = computed(() => {
    if (isSettingsPane.value) {
        return "Settings"
    }

    if (isSnippetsPane.value) {
        return "Snippets"
    }

    if (isFileManagerPane.value) {
        return fileManagerPane.value
            ? `${fileManagerPane.value.server.username}@${fileManagerPane.value.server.host}`
            : "Files"
    }

    if (!session.value) {
        return ""
    }

    if (
        !session.value.serverName &&
        session.value.ssh.connectionState.value === "offline" &&
        !session.value.ssh.status.value
    ) {
        return "Choose a server for this pane"
    }

    return (
        session.value.ssh.status.value ||
        session.value.ssh.connectionState.value
    )
})

const isDraggingOther = computed(
    () =>
        workspace.draggingTerminalId.value !== null &&
        workspace.draggingTerminalId.value !== props.node.terminalId
)

const dropZone = ref<"left" | "right" | "top" | "bottom" | null>(null)

const onDragOver = (event: DragEvent) => {
    event.preventDefault()
    const target = event.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height

    if (x < 0.25) dropZone.value = "left"
    else if (x > 0.75) dropZone.value = "right"
    else if (y < 0.5) dropZone.value = "top"
    else dropZone.value = "bottom"
}

const onDragLeave = () => {
    dropZone.value = null
}

const onDrop = async (event: DragEvent) => {
    event.preventDefault()
    const sourceId = event.dataTransfer?.getData("text/terminal-id")
    if (!sourceId || !props.node.terminalId || !dropZone.value) return

    if (settings.value.animationsEnabled) {
        await runFlip(
            sourceId,
            props.node.terminalId,
            dropZone.value,
            workspace.placeSession
        )
    } else {
        workspace.placeSession(sourceId, props.node.terminalId, dropZone.value)
    }

    dropZone.value = null
    workspace.draggingTerminalId.value = null
}

const onHeaderDragStart = (event: DragEvent) => {
    if (!props.node.terminalId || !event.dataTransfer) return
    event.dataTransfer.setData("text/terminal-id", props.node.terminalId)
    event.dataTransfer.effectAllowed = "move"
    workspace.draggingTerminalId.value = props.node.terminalId
}

const onHeaderDragEnd = () => {
    workspace.draggingTerminalId.value = null
}

const onSplitVertical = async (e: MouseEvent) => {
    e.stopPropagation()
    if (!props.node.terminalId) return
    await workspace.splitVertical(props.node.terminalId)
}

const onSplitHorizontal = async (e: MouseEvent) => {
    e.stopPropagation()
    if (!props.node.terminalId) return
    await workspace.splitHorizontal(props.node.terminalId)
}

const startResize = (event: MouseEvent) => {
    if (props.node.type !== "split" || !splitContainer.value) {
        return
    }

    event.preventDefault()
    const bounds = splitContainer.value.getBoundingClientRect()
    const size = isVerticalSplit.value ? bounds.width : bounds.height
    if (size <= 0) {
        return
    }

    const move = (moveEvent: MouseEvent) => {
        const nextPercentage = isVerticalSplit.value
            ? (moveEvent.clientX - bounds.left) / size
            : (moveEvent.clientY - bounds.top) / size

        emit("resize", {
            nodeId: props.node.id,
            splitPercentage: nextPercentage,
        })
    }

    const stop = () => {
        window.removeEventListener("mousemove", move)
        window.removeEventListener("mouseup", stop)
        stopResize = null
        isResizing.value = false
    }

    stop()
    stopResize = stop
    isResizing.value = true
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", stop)
}

onBeforeUnmount(() => {
    stopResize?.()
    clearTypingBadges()
})

const handleChildFocus = (terminalId: string) => emit("focus", terminalId)

const handleChildConnect = (payload: {
    terminalId: string
    server: ServerRecord
}) => emit("connect", payload)

const handleChildResize = (payload: {
    nodeId: string
    splitPercentage: number
}) => emit("resize", payload)

const handleChildUnlock = () => emit("unlock-vault")
const handleChildOpenFiles = (server: ServerRecord) =>
    emit("open-files", server)
const handleSetWatcherReadOnly = (id: number, ro: boolean) =>
    share.setWatcherReadOnly(id, ro)
</script>

<template>
    <div
        v-if="node.type === 'split'"
        ref="splitContainer"
        v-bind="attrs"
        class="grid h-full w-full min-h-0 min-w-0"
        :class="{
            'ws-transition-grid': !isResizing && settings.animationsEnabled,
        }"
        :style="splitTrackStyle"
    >
        <div class="min-h-0 min-w-0 overflow-hidden">
            <TerminalNode
                :node="node.children![0]"
                :servers="servers"
                :vault-ready="props.vaultReady"
                :focused-terminal-id="focusedTerminalId"
                :master-password="props.masterPassword"
                :file-manager-panes="props.fileManagerPanes"
                @focus="handleChildFocus"
                @connect="handleChildConnect"
                @resize="handleChildResize"
                @unlock-vault="handleChildUnlock"
                @open-files="handleChildOpenFiles"
                @close-file-manager="$emit('close-file-manager', $event)"
                :class="settings.animationsEnabled ? 'ws-transition-size' : ''"
            />
        </div>

        <div
            class="resizer bg-(--border-light) hover:bg-white/25 transition-colors"
            :class="isVerticalSplit ? 'cursor-col-resize' : 'cursor-row-resize'"
            @mousedown="startResize"
        />

        <div class="min-h-0 min-w-0 overflow-hidden">
            <TerminalNode
                :node="node.children![1]"
                :servers="servers"
                :vault-ready="props.vaultReady"
                :focused-terminal-id="focusedTerminalId"
                :master-password="props.masterPassword"
                :file-manager-panes="props.fileManagerPanes"
                @focus="handleChildFocus"
                @connect="handleChildConnect"
                @resize="handleChildResize"
                @unlock-vault="handleChildUnlock"
                @open-files="handleChildOpenFiles"
                @close-file-manager="$emit('close-file-manager', $event)"
                :class="settings.animationsEnabled ? 'ws-transition-size' : ''"
            />
        </div>
    </div>

    <section
        v-else-if="node.terminalId"
        v-bind="attrs"
        :data-terminal-id="node.terminalId"
        :class="[
            'relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border border-transparent bg-black',
            isFocused
                ? 'border-emerald-400/80 shadow-[inset_0_0_0_1px_rgba(80,250,123,0.35)]'
                : 'border-(--border)',
            { 'ws-transition': settings.animationsEnabled },
        ]"
        @mousedown="emit('focus', node.terminalId)"
    >
        <div
            v-if="isDraggingOther && !isSettingsPane && !isSnippetsPane"
            class="absolute inset-0 z-40"
            @dragover.prevent="onDragOver"
            @dragleave="onDragLeave"
            @drop.prevent="onDrop"
        >
            <div
                class="absolute inset-0 border-2 border-dashed border-blue-500/20 pointer-events-none"
            />
            <transition name="dropzone">
                <div
                    v-if="dropZone"
                    class="absolute bg-blue-500/35 border-2 border-blue-400 pointer-events-none transition-all duration-100"
                    :class="{
                        'inset-y-0 left-0 w-1/2': dropZone === 'left',
                        'inset-y-0 right-0 w-1/2': dropZone === 'right',
                        'inset-x-0 top-0 h-1/2': dropZone === 'top',
                        'inset-x-0 bottom-0 h-1/2': dropZone === 'bottom',
                    }"
                />
            </transition>
        </div>

        <header
            class="flex h-10 shrink-0 items-center gap-3 border-b border-(--border) px-3 transition-colors cursor-grab"
            :class="isFocused ? 'bg-(--surface)' : 'bg-(--surface-alt)'"
            draggable="true"
            @dragstart="onHeaderDragStart"
            @dragend="onHeaderDragEnd"
        >
            <span
                class="h-2 w-2 shrink-0 rounded-full"
                :class="
                    session?.ssh.connectionState.value === 'connected'
                        ? 'bg-emerald-400'
                        : 'bg-zinc-600'
                "
            />
            <div class="min-w-0 flex-1">
                <div class="flex min-w-0 items-center gap-2">
                    <p class="truncate text-xs text-white">
                        {{ sessionLabel }}
                    </p>
                </div>
                <p class="truncate text-xxs">
                    {{ sessionStatus || "Ready" }}
                </p>
            </div>
            <div class="flex items-center gap-2">
                <button
                    class="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:text-white hover:bg-white/10 transition-colors"
                    title="Split vertically"
                    @mousedown.stop
                    @click.stop="onSplitVertical"
                    aria-label="Split vertically"
                >
                    <span aria-hidden="true">◻</span>
                </button>

                <button
                    class="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:text-white hover:bg-white/10 transition-colors"
                    title="Split horizontally"
                    @mousedown.stop
                    @click.stop="onSplitHorizontal"
                    aria-label="Split horizontally"
                >
                    <span aria-hidden="true">⧉</span>
                </button>

                <button
                    v-if="
                        !isSettingsPane &&
                        !isSnippetsPane &&
                        !isFileManagerPane &&
                        session?.ssh.connectionState.value === 'connected'
                    "
                    class="shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors text-cyan-400 hover:text-cyan-300 hover:bg-white/10"
                    title="Browse files"
                    @mousedown.stop
                    @click.stop="
                        session &&
                        emit(
                            'open-files',
                            servers.find((s) => s.id === session!.serverId)!
                        )
                    "
                    aria-label="Browse files"
                >
                    <span aria-hidden="true">📁</span>
                </button>

                <button
                    v-if="
                        !isSettingsPane &&
                        !isSnippetsPane &&
                        !isFileManagerPane &&
                        session?.ssh.connectionState.value === 'connected'
                    "
                    class="shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors"
                    :class="
                        share.isSharing.value
                            ? 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20'
                            : 'hover:text-white hover:bg-white/10'
                    "
                    :title="
                        share.isSharing.value
                            ? 'Sharing active  click to manage'
                            : 'Share terminal'
                    "
                    @mousedown.stop
                    @click.stop="openShare"
                    aria-label="Share terminal"
                >
                    <span aria-hidden="true">🖥</span>
                </button>

                <button
                    v-if="!isSettingsPane && !isSnippetsPane"
                    class="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:text-white hover:bg-white/10 transition-colors"
                    title="Detach from tiling"
                    @mousedown.stop
                    @click.stop="workspace.detachPane(node.terminalId)"
                    aria-label="Detach pane"
                >
                    <span aria-hidden="true">↗</span>
                </button>
            </div>

            <button
                class="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:text-white hover:bg-white/10 transition-colors"
                title="Close pane (Ctrl+W)"
                @mousedown.stop
                @click.stop="
                    isFileManagerPane
                        ? $emit('close-file-manager', node.terminalId)
                        : handleClosePane(node.terminalId, workspace.closePane)
                "
                aria-label="Close pane"
            >
                <span aria-hidden="true">×</span>
            </button>
        </header>

        <div
            v-if="showTerminal"
            ref="terminalHostRef"
            class="relative flex-1 min-h-0 min-w-0 overflow-hidden"
            :class="settings.animationsEnabled ? 'ws-transition-size' : ''"
        >
            <TerminalWrapper :session-id="node.terminalId" />
            <template v-for="badge in typingBadges" :key="badge.id">
                <div
                    class="pointer-events-none absolute z-20 select-none"
                    :style="[
                        typingBadgeBaseStyle,
                        typingBadgeVisibleStyle,
                        { left: badge.x + 'px', top: badge.y + 'px' },
                    ]"
                >
                    <span :style="typingBadgeNameStyle">{{ badge.from }}</span>
                </div>
            </template>
        </div>
        <div
            v-else-if="isSettingsPane"
            class="flex-1 min-h-0 min-w-0 overflow-auto"
        >
            <Settings
                :vault-ready="props.vaultReady"
                @unlock-vault="$emit('unlock-vault')"
            />
        </div>

        <div
            v-else-if="isSnippetsPane"
            class="flex-1 min-h-0 min-w-0 overflow-auto"
        >
            <Snippets
                :ordered-sessions="workspace.orderedSessions.value"
                :master-password="props.masterPassword"
                :vault-ready="props.vaultReady"
            />
        </div>

        <div
            v-else-if="isFileManagerPane"
            class="flex-1 min-h-0 min-w-0 overflow-auto"
        >
            <FileManager
                :server="fileManagerPane?.server ?? null"
                :manager-key="node.terminalId"
                :master-password="
                    props.masterPassword as unknown as import('vue').Ref<string>
                "
            />
        </div>

        <div
            v-else
            class="flex flex-1 flex-col min-h-0 overflow-hidden bg-black"
        >
            <div class="border-b border-(--border) px-3 py-2 shrink-0">
                <p class="text-xxs uppercase tracking-widest">Connect</p>
                <p class="mt-1 text-xs text-secondary">
                    Choose a server for this pane.
                </p>
            </div>

            <div class="flex-1 overflow-y-auto scrollbar-hide">
                <div
                    v-if="servers.length === 0"
                    class="flex h-full items-center justify-center p-6"
                >
                    <p class="text-center text-xxs">No servers configured</p>
                </div>

                <button
                    v-for="server in servers"
                    :key="server.id"
                    class="group w-full border-b border-(--border) px-3 py-2.5 text-left transition-colors hover:bg-(--surface-alt)"
                    @click="
                        emit('connect', { terminalId: node.terminalId, server })
                    "
                >
                    <div class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                            <p
                                class="truncate text-xs font-bold text-secondary group-hover:text-white"
                            >
                                {{ server.name }}
                            </p>
                            <p class="truncate font-mono text-xxs">
                                {{ server.username }}@{{ server.host }}
                            </p>
                        </div>
                        <span class="shrink-0">
                            <span aria-hidden="true">→</span>
                        </span>
                    </div>
                </button>
            </div>
        </div>
    </section>

    <Teleport to="body">
        <ShareModal
            v-if="showShareModal"
            :share-url="share.shareUrl.value"
            :expires-in-secs="share.expiresInSecs.value"
            :remaining-secs="share.remainingSecs.value"
            :is-creating="share.isCreating.value"
            :is-expired="share.isExpired.value"
            :error="share.error.value"
            :read-only="shareReadOnly"
            :watchers="share.watchers.value"
            @update:read-only="shareReadOnly = $event"
            @create="handleCreateShare"
            @close="showShareModal = false"
            @stop="stopAndCloseShare"
            @kick="share.kickWatcher($event)"
            @ban="share.banWatcher($event)"
            @set-read-only="handleSetWatcherReadOnly"
        />
    </Teleport>
</template>

<style scoped>
.resizer {
    min-width: 4px;
    min-height: 4px;
}
</style>

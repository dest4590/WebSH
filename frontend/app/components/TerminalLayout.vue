<script setup lang="ts">
import { type Ref } from "vue"
import TerminalNode from "~/components/TerminalNode.vue"
import {
    useTerminalWorkspace,
    type LayoutNode,
} from "~/composables/useTerminalWorkspace"
import { type FileManagerPaneState } from "~/composables/useViewState"
import { type ServerRecord } from "~/lib/db"

defineProps<{
    root: LayoutNode | null
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

useTerminalWorkspace()

const handleNodeFocus = (terminalId: string) => emit("focus", terminalId)
const handleNodeConnect = (payload: {
    terminalId: string
    server: ServerRecord
}) => emit("connect", payload)
const handleNodeResize = (payload: {
    nodeId: string
    splitPercentage: number
}) => emit("resize", payload)
const handleNodeOpenFiles = (server: ServerRecord) => emit("open-files", server)
const handleNodeUnlock = () => emit("unlock-vault")
const handleNodeCloseFileManager = (paneId: string) =>
    emit("close-file-manager", paneId)
</script>

<template>
    <div class="flex-1 min-h-0 min-w-0 overflow-hidden">
        <TerminalNode
            v-if="root"
            :node="root"
            :servers="servers"
            :vault-ready="vaultReady"
            :focused-terminal-id="focusedTerminalId"
            :master-password="masterPassword"
            :file-manager-panes="fileManagerPanes"
            @focus="handleNodeFocus"
            @connect="handleNodeConnect"
            @resize="handleNodeResize"
            @unlock-vault="handleNodeUnlock"
            @open-files="handleNodeOpenFiles"
            @close-file-manager="handleNodeCloseFileManager"
        />
    </div>
</template>

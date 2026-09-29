<script setup lang="ts">
import type { TerminalSession } from "~/composables/useTerminalWorkspace"

const props = defineProps<{
    activeSession: TerminalSession | null
    activeSessionStatus: string | null
}>()
</script>

<template>
    <footer
        class="flex items-center gap-4 px-4 h-6 border-t border-(--border) bg-(--surface) shrink-0 text-xxs select-none"
    >
        <template v-if="props.activeSession">
            <span class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                {{
                    props.activeSession.serverName || props.activeSession.label
                }}
            </span>
            <span>|</span>
            <span class="truncate max-w-48">{{
                props.activeSessionStatus
            }}</span>
        </template>

        <span v-else>no active session</span>
    </footer>
</template>

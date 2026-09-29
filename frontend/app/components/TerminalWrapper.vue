<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useTerminalWorkspace } from "~/composables/useTerminalWorkspace"

const props = defineProps<{
    sessionId: string
}>()

const workspace = useTerminalWorkspace()
const container = ref<HTMLElement | null>(null)

let resizeObserver: ResizeObserver | null = null

const attach = (sessionId: string) => {
    if (!container.value) {
        return
    }

    workspace.attachSession(sessionId, container.value)
}

const detach = (sessionId: string) => {
    if (!container.value) {
        return
    }

    workspace.detachSession(sessionId, container.value)
}

onMounted(() => {
    attach(props.sessionId)

    if (container.value) {
        resizeObserver = new ResizeObserver(() => {
            workspace.fitSession(props.sessionId)
        })
        resizeObserver.observe(container.value)
    }
})

watch(
    () => props.sessionId,
    (nextSessionId, previousSessionId) => {
        if (previousSessionId) {
            detach(previousSessionId)
        }
        attach(nextSessionId)
    }
)

onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    detach(props.sessionId)
})
</script>

<template>
    <div
        ref="container"
        class="h-full w-full min-h-0 min-w-0 overflow-hidden"
    />
</template>

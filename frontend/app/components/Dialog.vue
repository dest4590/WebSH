<script setup lang="ts">
defineProps<{
    open: boolean
    maxWidth?: string
    title?: string
}>()

defineEmits<{
    (e: "close"): void
}>()
</script>

<template>
    <teleport to="body">
        <transition name="dialog">
            <div v-if="open" class="dialog-overlay" @click="$emit('close')">
                <div
                    class="dialog-content w-full mx-4 sm:mx-0"
                    :style="{ maxWidth: maxWidth || '500px' }"
                    @click.stop
                >
                    <div v-if="$slots.header || title" class="dialog-header">
                        <slot name="header">
                            <h2 class="text-lg font-semibold">{{ title }}</h2>
                        </slot>
                    </div>
                    <div class="dialog-body">
                        <slot />
                    </div>
                    <div v-if="$slots.footer" class="dialog-footer">
                        <slot name="footer" />
                    </div>
                </div>
            </div>
        </transition>
    </teleport>
</template>

<style scoped>
.dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 60;
    backdrop-filter: blur(4px);
}

.dialog-content {
    background: var(--surface);
    border: 1px solid var(--border-light);
    max-height: 90dvh;
    overflow-y: auto;
}

.dialog-header {
    padding: 20px;
    border-bottom: 1px solid var(--border);
}

.dialog-body {
    padding: 20px;
}

.dialog-footer {
    padding: 20px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}

.dialog-enter-active,
.dialog-leave-active {
    transition:
        opacity var(--transition-duration) ease,
        transform var(--transition-duration) cubic-bezier(0.4, 0, 0.2, 1);
}

.dialog-enter-from,
.dialog-leave-to {
    opacity: 0;
}
</style>

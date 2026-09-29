<script setup lang="ts">
defineProps<{
    label: string
    description?: string
    disabled?: boolean
}>()
</script>

<template>
    <div
        class="flex items-center justify-between gap-6 px-5 py-4"
        :class="{ 'opacity-40 pointer-events-none': disabled }"
    >
        <div class="min-w-0 flex-1">
            <p class="text-sm leading-none">{{ label }}</p>
            <p v-if="description" class="mt-1 text-xs text-secondary">
                {{ description }}
            </p>
        </div>
        <div class="shrink-0">
            <slot />
        </div>
    </div>
</template>

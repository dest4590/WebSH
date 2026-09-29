<script setup lang="ts">
defineProps<{
    title: string
    description?: string
}>()
</script>

<template>
    <section class="space-y-1">
        <div class="mb-4">
            <h2 class="text-xs font-bold uppercase tracking-widest">
                {{ title }}
            </h2>
            <p v-if="description" class="mt-0.5 text-xs">
                {{ description }}
            </p>
        </div>
        <div
            class="rounded border border-(--border) bg-(--surface) divide-y divide-(--border)"
        >
            <slot />
        </div>
    </section>
</template>

<script setup lang="ts">
import { onMounted } from "vue"
import { useNodes } from "~/composables/useNodes"

const { fetchNodes } = useNodes()

onMounted(async () => {
    await fetchNodes()
})
</script>

<template>
    <NuxtLayout>
        <NuxtPage />
    </NuxtLayout>
</template>

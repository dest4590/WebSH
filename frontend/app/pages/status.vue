<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import AppHeader from "~/components/AppHeader.vue"
import AppFooter from "~/components/AppFooter.vue"
import { useApi } from "~/composables/useApi"

interface NodeStatus {
    name: string
    status: string
    tier: string
}

const { request } = useApi()
const nodes = ref<NodeStatus[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const fetchStatus = async () => {
    loading.value = true
    error.value = null
    try {
        nodes.value = await request<NodeStatus[]>("/nodes/status")
    } catch (e: any) {
        error.value = e.message || "Failed to fetch node status"
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    onUnmounted(() => clearInterval(interval))
})
</script>

<template>
    <div class="min-h-screen bg-black text-white font-mono">
        <AppHeader />

        <main class="max-w-4xl mx-auto px-4 py-16 sm:py-24">
            <div class="space-y-8">
                <div class="space-y-2">
                    <h1 class="text-3xl font-bold tracking-tight">
                        Node Status
                    </h1>
                    <p class="text-secondary text-sm">
                        Real-time status of our global relay network.
                    </p>
                </div>

                <div
                    v-if="loading && nodes.length === 0"
                    class="py-12 text-center text-secondary animate-pulse"
                >
                    Fetching node status...
                </div>

                <div
                    v-else-if="error"
                    class="p-4 border border-red-500/50 bg-red-500/10 text-red-400 text-sm"
                >
                    {{ error }}
                </div>

                <div v-else class="grid gap-4 sm:grid-cols-2">
                    <div
                        v-for="node in nodes"
                        :key="node.name"
                        class="p-5 border border-(--border) bg-(--surface) space-y-4"
                    >
                        <div class="flex items-center justify-between">
                            <span class="font-bold">{{ node.name }}</span>
                            <div class="flex items-center gap-2">
                                <div
                                    class="w-2 h-2 rounded-full"
                                    :class="
                                        node.status === 'online'
                                            ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'
                                            : 'bg-red-500'
                                    "
                                />
                                <span
                                    class="text-xxs uppercase tracking-widest font-bold"
                                    :class="
                                        node.status === 'online'
                                            ? 'text-green-500'
                                            : 'text-red-500'
                                    "
                                >
                                    {{ node.status }}
                                </span>
                            </div>
                        </div>
                        <div
                            class="flex items-center justify-between text-xxs text-secondary uppercase tracking-widest"
                        >
                            <span>Tier</span>
                            <span class="font-bold text-white">{{
                                node.tier
                            }}</span>
                        </div>
                    </div>
                </div>

                <div
                    class="pt-8 border-t border-(--border) text-xxs text-secondary leading-relaxed"
                >
                    <p>
                        Nodes are monitored via periodic heartbeats. A node is
                        considered offline if no heartbeat is received for more
                        than 60 seconds. IP addresses and specific locations are
                        hidden for security.
                    </p>
                </div>
            </div>
        </main>

        <AppFooter />
    </div>
</template>

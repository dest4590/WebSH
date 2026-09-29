import { ref } from "vue"
import { useApi } from "./useApi"

export interface TunnelNode {
    name: string
    tier: string
    comment?: string
}

const nodes = ref<TunnelNode[]>([])
const loading = ref(false)

export const useNodes = () => {
    const { request } = useApi()

    async function fetchNodes() {
        loading.value = true
        try {
            const data = await request<TunnelNode[]>("/nodes")
            if (Array.isArray(data)) {
                nodes.value = data
            }
        } catch (e) {
            console.error("Failed to fetch nodes", e)
        } finally {
            loading.value = false
        }
    }

    const getBestNode = () => {
        if (nodes.value.length === 0) return null
        return nodes.value[0]
    }

    return {
        nodes,
        loading,
        fetchNodes,
        getBestNode,
    }
}

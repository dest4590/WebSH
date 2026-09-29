import { ref, computed } from "vue"
import { useApi } from "./useApi"

export interface NewsItem {
    id: number
    title: string
    content: string
    createdAt: number
}

const STORAGE_KEY = "websh-read-news"

const newsList = ref<NewsItem[]>([])
const readIds = ref<Set<number>>(new Set())
const loading = ref(false)

const isClientEnvironment = () => import.meta.client

const readStoredNewsIds = (): Set<number> | null => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
        return null
    }

    try {
        return new Set(JSON.parse(stored) as number[])
    } catch (error) {
        console.error("Failed to parse read news IDs", error)
        return null
    }
}

const persistReadIds = (ids: Set<number>) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)))
}

const countUnreadItems = (items: NewsItem[], ids: Set<number>) =>
    items.reduce(
        (count, item) => count + (ids.has(item.id) ? 0 : 1),
        0
    )

export const useNews = () => {
    const api = useApi()

    const fetchNews = async () => {
        loading.value = true
        try {
            const data = await api.request<NewsItem[]>("/news")
            if (Array.isArray(data)) {
                newsList.value = data
                syncReadStatus()
            }
        } catch (e) {
            console.error("Failed to fetch news", e)
        } finally {
            loading.value = false
        }
    }

    const syncReadStatus = () => {
        if (!isClientEnvironment()) {
            return
        }

        const storedReadIds = readStoredNewsIds()
        if (storedReadIds) {
            readIds.value = storedReadIds
        }
    }

    const markAsRead = (id: number) => {
        if (!isClientEnvironment() || readIds.value.has(id)) {
            return
        }

        const newSet = new Set(readIds.value)
        newSet.add(id)
        readIds.value = newSet
        persistReadIds(newSet)
    }

    const unreadCount = computed(() =>
        countUnreadItems(newsList.value, readIds.value)
    )

    const hasUnread = computed(() => unreadCount.value > 0)

    return {
        newsList,
        readIds,
        loading,
        fetchNews,
        markAsRead,
        hasUnread,
        unreadCount,
    }
}

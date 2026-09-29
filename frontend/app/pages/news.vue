<script setup lang="ts">
import { ref, onMounted, computed } from "vue"
import { useAuth } from "~/composables/useAuth"
import { useApi } from "~/composables/useApi"
import { useNews, type NewsItem } from "~/composables/useNews"

interface Comment {
    id: number
    newsId: number
    userId: number
    userName: string
    content: string
    createdAt: number
}

interface ReactionCount {
    reaction: string
    count: number
    me: boolean
}

interface NewsWithDetails {
    news: NewsItem
    comments: Comment[]
    reactions: ReactionCount[]
}

const auth = useAuth()
const api = useApi()
const { newsList, fetchNews: fetchList, markAsRead, readIds } = useNews()

const selectedNews = ref<NewsWithDetails | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const newComment = ref("")
const submittingComment = ref(false)
const deletingCommentId = ref<number | null>(null)
const editingCommentId = ref<number | null>(null)
const editingCommentContent = ref("")
const savingCommentId = ref<number | null>(null)

const showCreateModal = ref(false)
const createTitle = ref("")
const createContent = ref("")
const creatingNews = ref(false)

const showEditModal = ref(false)
const editTitle = ref("")
const editContent = ref("")
const editingNews = ref(false)

const isAdmin = computed(() => auth.user.value?.isAdmin || false)
const canEditNews = computed(() => isAdmin.value && Boolean(selectedNews.value))
const canManageComment = (comment: Comment) => {
    if (!auth.user.value) return false
    return auth.user.value.id === comment.userId || auth.user.value.isAdmin
}

const fetchNews = async () => {
    await fetchList()
}

const selectNews = async (id: number) => {
    loading.value = true
    error.value = null
    try {
        selectedNews.value = await api.request<NewsWithDetails>(
            `/news/${id}`,
            {},
            auth.isAuthenticated.value,
            auth.token.value || undefined
        )
        markAsRead(id)
    } catch (e: any) {
        error.value = e.message
    } finally {
        loading.value = false
    }
}

const postComment = async () => {
    if (!selectedNews.value || !newComment.value.trim()) return
    submittingComment.value = true
    try {
        const comment = await api.request<Comment>(
            `/news/${selectedNews.value.news.id}/comments`,
            {
                method: "POST",
                body: JSON.stringify({ content: newComment.value }),
            },
            true,
            auth.token.value || undefined
        )
        selectedNews.value.comments.push(comment)
        newComment.value = ""
    } catch (e: any) {
        alert(e.message)
    } finally {
        submittingComment.value = false
    }
}

const toggleReaction = async (reaction: string) => {
    if (!selectedNews.value || !auth.isAuthenticated.value) return
    try {
        await api.request(
            `/news/${selectedNews.value.news.id}/reactions`,
            {
                method: "POST",
                body: JSON.stringify({ reaction }),
            },
            true,
            auth.token.value || undefined
        )
        await selectNews(selectedNews.value.news.id)
    } catch (e: any) {
        alert(e.message)
    }
}

const openEditModal = () => {
    if (!selectedNews.value) return
    editTitle.value = selectedNews.value.news.title
    editContent.value = selectedNews.value.news.content
    showEditModal.value = true
}

const saveNewsEdit = async () => {
    if (
        !selectedNews.value ||
        !editTitle.value.trim() ||
        !editContent.value.trim()
    )
        return
    editingNews.value = true
    try {
        const updated = await api.request<NewsItem>(
            `/news/${selectedNews.value.news.id}`,
            {
                method: "PUT",
                body: JSON.stringify({
                    title: editTitle.value,
                    content: editContent.value,
                }),
            },
            true,
            auth.token.value || undefined
        )
        selectedNews.value = {
            ...selectedNews.value,
            news: updated,
        }
        newsList.value = newsList.value.map((item) =>
            item.id === updated.id ? updated : item
        )
        showEditModal.value = false
    } catch (e: any) {
        alert(e.message)
    } finally {
        editingNews.value = false
    }
}

const deleteComment = async (commentId: number) => {
    if (!selectedNews.value) return
    deletingCommentId.value = commentId
    try {
        await api.request(
            `/news/${selectedNews.value.news.id}/comments/${commentId}`,
            {
                method: "DELETE",
            },
            true,
            auth.token.value || undefined
        )
        selectedNews.value.comments = selectedNews.value.comments.filter(
            (comment) => comment.id !== commentId
        )
    } catch (e: any) {
        alert(e.message)
    } finally {
        deletingCommentId.value = null
    }
}

const startEditComment = (comment: Comment) => {
    editingCommentId.value = comment.id
    editingCommentContent.value = comment.content
}

const cancelEdit = () => {
    editingCommentId.value = null
    editingCommentContent.value = ""
}

const saveCommentEdit = async (commentId: number) => {
    if (!selectedNews.value) return
    if (!editingCommentContent.value.trim()) return
    savingCommentId.value = commentId
    try {
        const updated = await api.request<Comment>(
            `/news/${selectedNews.value.news.id}/comments/${commentId}`,
            {
                method: "PUT",
                body: JSON.stringify({ content: editingCommentContent.value }),
            },
            true,
            auth.token.value || undefined
        )

        selectedNews.value.comments = selectedNews.value.comments.map((c) =>
            c.id === updated.id ? updated : c
        )
        cancelEdit()
    } catch (e: any) {
        alert(e.message)
    } finally {
        savingCommentId.value = null
    }
}

const createNews = async () => {
    if (!createTitle.value.trim() || !createContent.value.trim()) return
    creatingNews.value = true
    try {
        await api.request(
            "/news",
            {
                method: "POST",
                body: JSON.stringify({
                    title: createTitle.value,
                    content: createContent.value,
                }),
            },
            true,
            auth.token.value || undefined
        )
        showCreateModal.value = false
        createTitle.value = ""
        createContent.value = ""
        await fetchNews()
    } catch (e: any) {
        alert(e.message)
    } finally {
        creatingNews.value = false
    }
}

const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
}

const reactions = [">_<", "^_^", "O_O", "T_T", "-_-", "(o_o)", "(^_^)"]

onMounted(() => {
    void auth.restoreSession()
    void fetchNews()
})

const findReaction = (r: string): ReactionCount | undefined => {
    return selectedNews.value?.reactions.find(
        (rc: ReactionCount) => rc.reaction === r
    )
}
</script>

<template>
    <div class="news-page relative">
        <AppHeader />

        <div
            class="min-h-screen p-4 sm:p-8 max-w-6xl mx-auto bg-black text-white"
        >
            <div
                class="border-b border-white/10 pb-6 mb-10 flex flex-wrap justify-between items-end gap-4"
            >
                <div>
                    <h1
                        class="text-3xl sm:text-4xl font-semibold tracking-tight"
                    >
                        News
                    </h1>
                    <p class="mt-3 text-white/60 max-w-2xl">
                        Stay updated with the latest WebSH features and
                        announcements.
                    </p>
                </div>
                <button
                    v-if="isAdmin"
                    class="ws-btn-primary px-4 py-2 text-xs"
                    @click="showCreateModal = true"
                >
                    Create News
                </button>
            </div>

            <div
                v-if="error"
                class="bg-red-500/10 border border-red-500/20 p-4 text-red-400 mb-6"
            >
                {{ error }}
            </div>

            <div class="grid gap-8 lg:grid-cols-3">
                <div class="lg:col-span-1 space-y-4">
                    <div
                        v-for="item in newsList"
                        :key="item.id"
                        class="border border-white/10 p-4 cursor-pointer transition-colors hover:bg-white/5 relative"
                        :class="{
                            'bg-white/10 border-white/30':
                                selectedNews?.news.id === item.id,
                        }"
                        @click="selectNews(item.id)"
                    >
                        <div
                            v-if="!readIds.has(item.id)"
                            class="absolute top-4 right-4 w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                        ></div>
                        <h3 class="font-bold text-lg">{{ item.title }}</h3>
                        <p class="text-xs text-white/40 mt-1">
                            {{ formatDate(item.createdAt) }}
                        </p>
                    </div>
                    <div
                        v-if="newsList.length === 0 && !loading"
                        class="text-white/40 text-center py-8"
                    >
                        No news yet.
                    </div>
                </div>

                <div class="lg:col-span-2">
                    <div v-if="selectedNews" class="space-y-8">
                        <div class="border border-white/10 p-6 bg-white/5">
                            <div
                                class="flex flex-wrap justify-between items-start gap-4 mb-4"
                            >
                                <h2 class="text-2xl sm:text-3xl font-bold">
                                    {{ selectedNews.news.title }}
                                </h2>
                                <button
                                    v-if="canEditNews"
                                    class="ws-btn-primary px-4 py-2 text-xs"
                                    @click="openEditModal"
                                >
                                    Edit News
                                </button>
                            </div>
                            <div class="text-white/40 text-xs mb-6">
                                Posted on
                                {{ formatDate(selectedNews.news.createdAt) }}
                            </div>
                            <div
                                class="prose prose-invert max-w-none news-content"
                                v-html="selectedNews.news.content"
                            ></div>

                            <div
                                class="mt-8 pt-6 border-t border-white/10 flex flex-wrap gap-2"
                            >
                                <button
                                    v-for="r in reactions"
                                    :key="r"
                                    class="px-3 py-1.5 text-xs border transition-colors flex items-center gap-2"
                                    :class="
                                        findReaction(r)?.me
                                            ? 'bg-white text-black border-white'
                                            : 'bg-transparent text-white/60 border-white/10 hover:border-white/30'
                                    "
                                    @click="toggleReaction(r)"
                                >
                                    <span>{{ r }}</span>
                                    <span
                                        v-if="findReaction(r)?.count"
                                        class="font-bold"
                                    >
                                        {{ findReaction(r)?.count }}
                                    </span>
                                </button>
                            </div>
                        </div>

                        <div class="space-y-6">
                            <h3 class="text-xl font-bold">Comments</h3>

                            <div v-if="auth.isAuthenticated" class="space-y-3">
                                <textarea
                                    v-model="newComment"
                                    class="w-full bg-black border border-white/10 p-3 text-sm focus:border-white/30 outline-none min-h-25"
                                    placeholder="Write a comment..."
                                ></textarea>
                                <div class="flex justify-end">
                                    <button
                                        class="ws-btn-primary px-4 py-2 text-xs"
                                        :disabled="
                                            submittingComment ||
                                            !newComment.trim()
                                        "
                                        @click="postComment"
                                    >
                                        {{
                                            submittingComment
                                                ? "Posting..."
                                                : "Post Comment"
                                        }}
                                    </button>
                                </div>
                            </div>
                            <div
                                v-else
                                class="p-4 border border-white/10 text-white/40 text-sm text-center"
                            >
                                Please
                                <NuxtLink
                                    to="/login"
                                    class="text-white underline"
                                    >login</NuxtLink
                                >
                                to post comments and react.
                            </div>

                            <div class="space-y-4">
                                <div
                                    v-for="comment in selectedNews.comments"
                                    :key="comment.id"
                                    class="border-l-2 border-white/10 pl-4 py-2"
                                >
                                    <div
                                        class="flex justify-between items-center mb-1 gap-2"
                                    >
                                        <span
                                            class="text-xs font-bold text-white/80"
                                            >{{ comment.userName }}</span
                                        >
                                        <div class="flex items-center gap-2">
                                            <span
                                                class="text-[10px] text-white/30"
                                                >{{
                                                    formatDate(
                                                        comment.createdAt
                                                    )
                                                }}</span
                                            >
                                            <template
                                                v-if="canManageComment(comment)"
                                            >
                                                <button
                                                    class="ws-btn px-2 py-1 text-[10px]"
                                                    v-if="
                                                        editingCommentId !==
                                                        comment.id
                                                    "
                                                    @click="
                                                        startEditComment(
                                                            comment
                                                        )
                                                    "
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    v-if="
                                                        editingCommentId ===
                                                        comment.id
                                                    "
                                                    class="ws-btn px-2 py-1 text-[10px]"
                                                    :disabled="
                                                        savingCommentId ===
                                                        comment.id
                                                    "
                                                    @click="
                                                        saveCommentEdit(
                                                            comment.id
                                                        )
                                                    "
                                                >
                                                    {{
                                                        savingCommentId ===
                                                        comment.id
                                                            ? "Saving..."
                                                            : "Save"
                                                    }}
                                                </button>
                                                <button
                                                    v-if="
                                                        editingCommentId ===
                                                        comment.id
                                                    "
                                                    class="ws-btn px-2 py-1 text-[10px]"
                                                    @click="cancelEdit"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    class="ws-btn px-2 py-1 text-[10px]"
                                                    :disabled="
                                                        deletingCommentId ===
                                                            comment.id ||
                                                        editingCommentId ===
                                                            comment.id
                                                    "
                                                    @click="
                                                        deleteComment(
                                                            comment.id
                                                        )
                                                    "
                                                >
                                                    {{
                                                        deletingCommentId ===
                                                        comment.id
                                                            ? "Deleting..."
                                                            : "Delete"
                                                    }}
                                                </button>
                                            </template>
                                        </div>
                                    </div>
                                    <div class="text-sm text-white/60">
                                        <template
                                            v-if="
                                                editingCommentId === comment.id
                                            "
                                        >
                                            <textarea
                                                v-model="editingCommentContent"
                                                class="w-full bg-black border border-white/10 p-3 text-sm focus:border-white/30 outline-none min-h-25"
                                            ></textarea>
                                        </template>
                                        <template v-else>
                                            <p>{{ comment.content }}</p>
                                        </template>
                                    </div>
                                </div>
                                <div
                                    v-if="selectedNews.comments.length === 0"
                                    class="text-white/30 text-sm italic"
                                >
                                    No comments yet.
                                </div>
                            </div>
                        </div>
                    </div>
                    <div
                        v-else-if="!loading"
                        class="h-full flex items-center justify-center border border-white/5 text-white/20 italic"
                    >
                        Select a news item to read more.
                    </div>
                    <div v-else class="h-full flex items-center justify-center">
                        <div class="animate-pulse text-white/40">
                            Loading...
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div
            v-if="showCreateModal"
            class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
            <div
                class="bg-black border border-white/10 w-full max-w-2xl p-6 space-y-6"
            >
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold">Create News Item</h2>
                    <button
                        @click="showCreateModal = false"
                        class="text-white/40 hover:text-white"
                    >
                        &times;
                    </button>
                </div>
                <div class="space-y-4">
                    <div class="space-y-1">
                        <label
                            class="text-xs uppercase tracking-widest text-white/40"
                            >Title</label
                        >
                        <input
                            v-model="createTitle"
                            type="text"
                            class="w-full bg-black border border-white/10 p-3 text-sm focus:border-white/30 outline-none"
                            placeholder="News title"
                        />
                    </div>
                    <div class="space-y-1">
                        <label
                            class="text-xs uppercase tracking-widest text-white/40"
                            >Content (HTML supported)</label
                        >
                        <textarea
                            v-model="createContent"
                            class="w-full bg-black border border-white/10 p-3 text-sm focus:border-white/30 outline-none min-h-75"
                            placeholder="News content... You can use HTML here."
                        ></textarea>
                    </div>
                </div>
                <div class="flex justify-end gap-3">
                    <button
                        class="ws-btn px-4 py-2 text-xs"
                        @click="showCreateModal = false"
                    >
                        Cancel
                    </button>
                    <button
                        class="ws-btn-primary px-4 py-2 text-xs"
                        :disabled="
                            creatingNews ||
                            !createTitle.trim() ||
                            !createContent.trim()
                        "
                        @click="createNews"
                    >
                        {{ creatingNews ? "Creating..." : "Create News" }}
                    </button>
                </div>
            </div>
        </div>

        <div
            v-if="showEditModal"
            class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
            <div
                class="bg-black border border-white/10 w-full max-w-2xl p-6 space-y-6"
            >
                <div class="flex justify-between items-center">
                    <h2 class="text-xl font-bold">Edit News Item</h2>
                    <button
                        @click="showEditModal = false"
                        class="text-white/40 hover:text-white"
                    >
                        &times;
                    </button>
                </div>
                <div class="space-y-4">
                    <div class="space-y-1">
                        <label
                            class="text-xs uppercase tracking-widest text-white/40"
                            >Title</label
                        >
                        <input
                            v-model="editTitle"
                            type="text"
                            class="w-full bg-black border border-white/10 p-3 text-sm focus:border-white/30 outline-none"
                            placeholder="News title"
                        />
                    </div>
                    <div class="space-y-1">
                        <label
                            class="text-xs uppercase tracking-widest text-white/40"
                            >Content (HTML supported)</label
                        >
                        <textarea
                            v-model="editContent"
                            class="w-full bg-black border border-white/10 p-3 text-sm focus:border-white/30 outline-none min-h-75"
                            placeholder="News content... You can use HTML here."
                        ></textarea>
                    </div>
                </div>
                <div class="flex justify-end gap-3">
                    <button
                        class="ws-btn px-4 py-2 text-xs"
                        @click="showEditModal = false"
                    >
                        Cancel
                    </button>
                    <button
                        class="ws-btn-primary px-4 py-2 text-xs"
                        :disabled="
                            editingNews ||
                            !editTitle.trim() ||
                            !editContent.trim()
                        "
                        @click="saveNewsEdit"
                    >
                        {{ editingNews ? "Saving..." : "Save Changes" }}
                    </button>
                </div>
            </div>
        </div>

        <AppFooter />
    </div>
</template>

<style scoped>
@import "tailwindcss";

.news-content :deep(h1) {
    @apply text-2xl font-bold mb-4 mt-6;
}
.news-content :deep(h2) {
    @apply text-xl font-bold mb-3 mt-5;
}
.news-content :deep(p) {
    @apply mb-4 leading-relaxed text-white/80;
}
.news-content :deep(ul) {
    @apply list-disc list-inside mb-4 space-y-1;
}
.news-content :deep(ol) {
    @apply list-decimal list-inside mb-4 space-y-1;
}
.news-content :deep(a) {
    @apply text-emerald-400 underline hover:text-emerald-300;
}
.news-content :deep(code) {
    @apply bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono;
}
.news-content :deep(pre) {
    @apply bg-white/5 p-4 rounded mb-4 overflow-x-auto font-mono text-sm;
}
.news-content :deep(blockquote) {
    @apply border-l-4 border-white/20 pl-4 italic my-4 text-white/60;
}
.news-content :deep(img) {
    @apply max-w-full h-auto rounded my-4;
}
</style>

import { ref, computed } from "vue"
import { db, type SnippetRecord } from "~/lib/db"
import { useAuth } from "~/composables/useAuth"

export const FREE_SNIPPET_LIMIT = 5

const DEFAULT_SNIPPET_TITLE = "Untitled Snippet"

const normalizeSnippetTitle = (title: string) =>
    title.trim() || DEFAULT_SNIPPET_TITLE

const createSnippetRecord = (
    title: string,
    script: string,
    runDir: string,
    timestamp: number
) => ({
    title: normalizeSnippetTitle(title),
    script,
    runDir: runDir.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
})

const createSnippetPatch = (
    updates: Partial<Pick<SnippetRecord, "title" | "script" | "runDir">>
): Partial<SnippetRecord> => ({
    ...updates,
    title:
        updates.title === undefined
            ? undefined
            : normalizeSnippetTitle(updates.title),
    runDir: updates.runDir === undefined ? undefined : updates.runDir.trim(),
    updatedAt: Date.now(),
})

const snippets = ref<SnippetRecord[]>([])
const status = ref("")

export const useSnippets = () => {
    const { user } = useAuth()

    const isPro = computed(() => {
        const tier = user.value?.subscriptionTier ?? "free"
        return tier !== "free"
    })

    const snippetLimit = computed(() =>
        isPro.value ? Infinity : FREE_SNIPPET_LIMIT
    )

    const canAddMore = computed(() => snippets.value.length < snippetLimit.value)

    const refreshSnippets = async () => {
        snippets.value = await db.snippets
            .orderBy("updatedAt")
            .reverse()
            .toArray()
    }

    const addSnippet = async (
        title: string,
        script: string,
        runDir: string
    ): Promise<SnippetRecord | null> => {
        if (!canAddMore.value) {
            status.value = `Free plan is limited to ${FREE_SNIPPET_LIMIT} snippets. Upgrade to Pro for unlimited snippets.`
            return null
        }

        const now = Date.now()
        const id = await db.snippets.add(
            createSnippetRecord(title, script, runDir, now)
        )

        await refreshSnippets()
        const record = snippets.value.find((s) => s.id === id) ?? null
        status.value = "Snippet saved."
        return record
    }

    const updateSnippet = async (
        id: number,
        updates: Partial<Pick<SnippetRecord, "title" | "script" | "runDir">>
    ) => {
        await db.snippets.update(id, createSnippetPatch(updates))
        await refreshSnippets()
        status.value = "Snippet updated."
    }

    const removeSnippet = async (id: number) => {
        await db.snippets.delete(id)
        await refreshSnippets()
        status.value = "Snippet deleted."
    }

    const replaceAll = async (incoming: SnippetRecord[]) => {
        await db.snippets.clear()
        const now = Date.now()
        for (const snippet of incoming) {
            const { id: _id, ...persistedSnippet } = snippet
            await db.snippets.add({
                ...persistedSnippet,
                updatedAt: now,
            })
        }
        await refreshSnippets()
    }

    return {
        snippets,
        status,
        isPro,
        snippetLimit,
        canAddMore,
        FREE_SNIPPET_LIMIT,
        refreshSnippets,
        addSnippet,
        updateSnippet,
        removeSnippet,
        replaceAll,
    }
}

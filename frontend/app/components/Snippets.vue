<script setup lang="ts">
import { ref, computed, watch, onMounted, type Ref, type PropType } from "vue"
import { useSnippets, FREE_SNIPPET_LIMIT } from "~/composables/useSnippets"
import { useDialog } from "~/composables/useDialog"
import type { TerminalSession } from "~/composables/useTerminalWorkspace"
import type { SnippetRecord } from "~/lib/db"
import { useTerminalWorkspace } from "~/composables/useTerminalWorkspace"
import { useServers } from "~/composables/useServers"
import { nextTick } from "vue"

const props = defineProps({
    orderedSessions: {
        type: Array as PropType<TerminalSession[]>,
        required: true,
    },
    masterPassword: {
        type: [Object, String] as PropType<Ref<string> | string>,
        required: true,
    },
    vaultReady: {
        type: Boolean,
        required: true,
    },
})

const {
    snippets,
    status: snippetStatus,
    isPro,
    canAddMore,
    addSnippet,
    updateSnippet,
    removeSnippet,
    replaceAll,
    refreshSnippets,
} = useSnippets()

const dialog = useDialog()

import { isRef } from "vue"

const rawMaster = props.masterPassword as unknown as Ref<string> | string
const masterPasswordRef = isRef(rawMaster)
    ? (rawMaster as Ref<string>)
    : ref(rawMaster as string)

onMounted(refreshSnippets)

const selectedId = ref<number | null>(null)
const editTitle = ref("")
const editScript = ref("")
const editRunDir = ref("")
const dirty = ref(false)
const search = ref("")

const filteredSnippets = computed(() => {
    const q = search.value.toLowerCase().trim()
    if (!q) return snippets.value
    return snippets.value.filter(
        (s: SnippetRecord) =>
            s.title.toLowerCase().includes(q) ||
            s.script.toLowerCase().includes(q)
    )
})

const selectedSnippet = computed(
    () =>
        snippets.value.find((s: SnippetRecord) => s.id === selectedId.value) ??
        null
)

watch(
    selectedSnippet,
    (s) => {
        if (!s) {
            selectedId.value = null
            editTitle.value = ""
            editScript.value = ""
            editRunDir.value = "~"
            dirty.value = false
            return
        }

        if (dirty.value) return

        editTitle.value = s.title
        editScript.value = s.script
        editRunDir.value = s.runDir || "~"
        selectedId.value = s.id ?? null
        dirty.value = false
    },
    { immediate: true }
)

const selectSnippet = (id: number) => {
    if (dirty.value && selectedId.value !== null) {
        saveCurrentSnippet()
    }
    const s = snippets.value.find((sn: SnippetRecord) => sn.id === id)
    if (!s) return
    selectedId.value = id
    editTitle.value = s.title
    editScript.value = s.script
    editRunDir.value = s.runDir
    dirty.value = false
}

const markDirty = () => {
    dirty.value = true
}

const saveCurrentSnippet = async () => {
    if (selectedId.value === null) return
    await updateSnippet(selectedId.value, {
        title: editTitle.value,
        script: editScript.value,
        runDir: editRunDir.value,
    })
    dirty.value = false
}

const createSnippet = async () => {
    if (!canAddMore.value) return
    const record = await addSnippet("New Snippet", "", "~")
    if (record?.id) selectSnippet(record.id)
}

const deleteSnippet = async (id: number) => {
    await removeSnippet(id)
    if (selectedId.value === id) {
        selectedId.value = null
        editTitle.value = ""
        editScript.value = ""
        editRunDir.value = "~"
        dirty.value = false
    }
}

const confirmDeleteSnippet = async (id: number) => {
    const snippet = snippets.value.find((s) => s.id === id)
    if (!snippet) return

    const confirmed = await dialog.showConfirm(
        `Delete snippet "${snippet.title}"? This cannot be undone.`,
        {
            title: "Delete snippet",
            okLabel: "Delete",
            cancelLabel: "Cancel",
            maxWidth: "500px",
        }
    )

    if (!confirmed) return
    await deleteSnippet(id)
}

const runTargetId = ref<string | null>(null)
const runMode = ref<"current" | "new">("current")
const serverSelectId = ref<number | null>(null)

const connectedSessions = computed(() =>
    props.orderedSessions.filter(
        (s: TerminalSession) => s.ssh.connectionState.value === "connected"
    )
)

watch(
    connectedSessions,
    (sessions) => {
        if (sessions.length && !runTargetId.value) {
            runTargetId.value = sessions[0]?.id ?? null
        }
        if (
            runTargetId.value &&
            !sessions.find((s: TerminalSession) => s.id === runTargetId.value)
        ) {
            runTargetId.value = sessions[0]?.id ?? null
        }
    },
    { immediate: true }
)

const workspace = useTerminalWorkspace(masterPasswordRef)
const { servers, activeServerId, refreshServers } =
    useServers(masterPasswordRef)

onMounted(async () => {
    await refreshServers()
    if (activeServerId.value) serverSelectId.value = activeServerId.value
})

const runSnippet = async () => {
    if (!editScript.value.trim()) return

    const dir = editRunDir.value.trim() || "~"
    const DELIM = "__WEBSH_SNIPPET_EOF__"
    const cmd =
        `cd ${dir} 2>/dev/null || { echo "[snippet] cannot cd to ${dir}, staying in $PWD"; }` +
        `\nbash << '${DELIM}'\n${editScript.value}\n${DELIM}\n`

    if (runMode.value === "current") {
        const active = (workspace.activeSession.value ??
            connectedSessions.value.find(
                (s: TerminalSession) => s.id === runTargetId.value
            ) ??
            null) as TerminalSession | null
        if (!active) return
        active.ssh.sendInput(cmd)
        return
    }

    if (serverSelectId.value) {
        const server = servers.value.find((s) => s.id === serverSelectId.value)
        if (!server) return
        await workspace.connectSessionToServer(null, server)
        const active = workspace.activeSession.value as TerminalSession | null
        if (!active) return

        const waitForConnected = async (
            sess: TerminalSession,
            timeout = 15000
        ) => {
            const start = Date.now()
            while (Date.now() - start < timeout) {
                if (sess.ssh.connectionState.value === "connected") return true
                await new Promise((r) => setTimeout(r, 200))
            }
            return false
        }

        const ok = await waitForConnected(active, 15000)
        if (!ok) {
            try {
                active.terminal.writeln(
                    "[snippet] connection timed out; snippet not sent."
                )
            } catch {}
            return
        }

        active.ssh.sendInput(cmd)
        return
    }

    const baseId =
        workspace.activeSession.value?.id ??
        runTargetId.value ??
        props.orderedSessions[0]?.id
    if (!baseId) return

    const newId = await workspace.splitHorizontal(baseId)
    if (!newId) return

    await nextTick()
    const newSession = workspace.sessions.get(newId)
    if (!newSession) return
    newSession.ssh.sendInput(cmd)
}

let Codemirror: any = null
let cmExtensions: any[] = []

const cmReady = ref(false)
const cmInstance = ref<any>(null)

if (import.meta.client) {
    import("vue-codemirror").then(async (mod) => {
        Codemirror = mod.Codemirror
        const { EditorView, keymap } = await import("@codemirror/view")
        const { defaultKeymap } = await import("@codemirror/commands")
        const { StreamLanguage } = await import("@codemirror/language")
        const { shell } = await import("@codemirror/legacy-modes/mode/shell")
        const { oneDark } = await import("@codemirror/theme-one-dark")

        cmExtensions = [
            StreamLanguage.define(shell),
            oneDark,
            EditorView.lineWrapping,
            keymap.of(defaultKeymap),
            EditorView.theme({
                "&": { height: "100%", background: "transparent" },
                ".cm-scroller": { overflow: "auto", fontFamily: "monospace" },
            }),
        ]
        cmReady.value = true
    })
}
</script>

<template>
    <div class="flex flex-col h-full overflow-hidden">
        <div
            class="flex items-center justify-between px-6 py-4 border-b border-(--border) shrink-0"
        >
            <div>
                <h1 class="text-2xl font-bold text-white tracking-tight">
                    Snippets
                </h1>
                <p class="text-xs text-secondary mt-0.5">
                    Reusable bash scripts - run them on any connected server.
                </p>
            </div>
        </div>

        <div class="flex flex-col sm:flex-row flex-1 overflow-hidden">
            <div
                class="flex flex-col sm:w-60 shrink-0 border-b sm:border-b-0 sm:border-r border-(--border) overflow-hidden snippets-list-panel"
            >
                <div
                    class="flex items-center gap-2 px-3 py-2 border-b border-(--border)"
                >
                    <input
                        v-model="search"
                        class="ws-input text-xs flex-1 py-1 px-2"
                        placeholder="Search…"
                    />
                    <button
                        class="ws-btn text-xs px-2 py-1 shrink-0 inline-flex items-center justify-center"
                        :disabled="!canAddMore"
                        :title="
                            canAddMore
                                ? 'New snippet'
                                : `Limit reached (${FREE_SNIPPET_LIMIT} on Free plan)`
                        "
                        @click="createSnippet"
                        aria-label="New snippet"
                    >
                        <span aria-hidden="true">+</span>
                    </button>
                </div>

                <div
                    v-if="!isPro && !canAddMore"
                    class="px-3 py-2 bg-amber-400/10 border-b border-amber-400/30 text-xs text-amber-300"
                >
                    Free plan: {{ FREE_SNIPPET_LIMIT }} snippet limit.
                    <a
                        href="/plans"
                        class="underline ml-1 inline-flex items-center gap-1"
                    >
                        Upgrade
                        <span aria-hidden="true">→</span>
                    </a>
                </div>

                <ul class="flex-1 overflow-y-auto">
                    <li
                        v-for="snippet in filteredSnippets"
                        :key="snippet.id"
                        :class="[
                            'group flex items-center justify-between px-3 py-2 cursor-pointer text-sm border-b border-(--border) hover:bg-(--surface)',
                            selectedId === snippet.id
                                ? 'bg-(--surface) text-white'
                                : 'text-secondary',
                        ]"
                        @click="selectSnippet(snippet.id!)"
                    >
                        <span class="truncate flex-1 min-w-0">
                            {{ snippet.title }}
                        </span>
                        <button
                            class="ml-2 opacity-0 group-hover:opacity-100 shrink-0 text-xs"
                            title="Delete snippet"
                            @click.stop="confirmDeleteSnippet(snippet.id!)"
                            aria-label="Delete snippet"
                        >
                            <span
                                class="text-red-400 hover:text-red-300"
                                aria-hidden="true"
                                >🗑️</span
                            >
                        </button>
                    </li>

                    <li
                        v-if="filteredSnippets.length === 0"
                        class="px-3 py-4 text-xs text-secondary text-center"
                    >
                        {{
                            search
                                ? "No results."
                                : "No snippets yet. Press + to create one."
                        }}
                    </li>
                </ul>

                <div
                    v-if="snippetStatus"
                    class="px-3 py-2 text-xs text-secondary border-t border-(--border) truncate"
                >
                    {{ snippetStatus }}
                </div>
            </div>

            <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
                <template v-if="selectedSnippet">
                    <div
                        class="flex items-center gap-3 px-4 py-3 border-b border-(--border) shrink-0"
                    >
                        <input
                            :key="selectedId ?? 'none'"
                            v-model="editTitle"
                            class="ws-input text-sm py-1.5 max-w-64 px-3"
                            placeholder="Snippet title"
                            @input="markDirty"
                            aria-label="Snippet title"
                        />
                        <label class="text-xs text-secondary shrink-0">
                            Run dir
                        </label>
                        <input
                            v-model="editRunDir"
                            class="ws-input text-xs py-1.5 px-3 font-mono"
                            placeholder="~"
                            @input="markDirty"
                        />
                        <button
                            v-if="dirty"
                            class="ws-btn-primary text-xs px-3 py-1.5 shrink-0"
                            @click="saveCurrentSnippet"
                        >
                            Save
                        </button>
                    </div>

                    <div class="flex-1 overflow-hidden relative">
                        <ClientOnly>
                            <component
                                :is="Codemirror"
                                v-if="cmReady && Codemirror"
                                ref="cmInstance"
                                v-model="editScript"
                                :extensions="cmExtensions"
                                class="h-full w-full text-sm"
                                @update:model-value="markDirty"
                            />
                            <template #fallback>
                                <textarea
                                    v-model="editScript"
                                    class="w-full h-full bg-transparent font-mono text-sm p-4 resize-none outline-none"
                                    placeholder="#!/usr/bin/env bash&#10;# Your script here"
                                    @input="markDirty"
                                />
                            </template>
                        </ClientOnly>
                        <div
                            v-if="!cmReady"
                            class="absolute inset-0 flex items-center justify-center bg-(--bg)/80"
                        >
                            <textarea
                                v-model="editScript"
                                class="w-full h-full bg-transparent font-mono text-sm p-4 resize-none outline-none"
                                placeholder="#!/usr/bin/env bash&#10;# Your script here"
                                @input="markDirty"
                            />
                        </div>
                    </div>

                    <div
                        class="flex items-center gap-3 px-4 py-3 border-t border-(--border) shrink-0 bg-(--surface)"
                    >
                        <span class="text-xs text-secondary shrink-0"
                            >Run on:</span
                        >
                        <div class="flex items-center gap-3 px-2">
                            <label class="text-xs flex items-center gap-2">
                                <input
                                    type="radio"
                                    class="accent-amber-400"
                                    value="current"
                                    v-model="runMode"
                                />
                                Current terminal
                            </label>
                            <label class="text-xs flex items-center gap-2">
                                <input
                                    type="radio"
                                    class="accent-amber-400"
                                    value="new"
                                    v-model="runMode"
                                />
                                New pane
                            </label>
                        </div>

                        <div class="flex-1">
                            <select
                                v-if="
                                    connectedSessions.length &&
                                    runMode === 'current'
                                "
                                v-model="runTargetId"
                                class="ws-input text-xs py-1 px-2 flex-1"
                            >
                                <option
                                    v-for="s in connectedSessions"
                                    :key="s.id"
                                    :value="s.id"
                                >
                                    {{ s.serverName }} ({{ s.label }})
                                </option>
                            </select>

                            <div class="flex gap-2 items-center">
                                <select
                                    v-if="runMode === 'new'"
                                    v-model="serverSelectId"
                                    class="ws-input text-xs py-1 px-2"
                                >
                                    <option :value="null">
                                        Select server to connect…
                                    </option>
                                    <option
                                        v-for="s in servers"
                                        :key="s.id"
                                        :value="s.id"
                                    >
                                        {{ s.name }} - {{ s.host }}
                                    </option>
                                </select>
                            </div>

                            <span
                                v-if="
                                    runMode === 'current' &&
                                    !connectedSessions.length
                                "
                                class="text-xs text-secondary italic flex-1"
                                >No connected sessions</span
                            >
                        </div>
                        <button
                            class="ws-btn-primary text-xs px-4 py-1.5 shrink-0"
                            :disabled="
                                !editScript.trim() ||
                                (runMode === 'current' && !runTargetId) ||
                                (runMode === 'new' && !serverSelectId)
                            "
                            title="Send script to selected terminal"
                            @click="runSnippet"
                        >
                            ▶ Run
                        </button>
                    </div>
                </template>

                <div
                    v-else
                    class="flex flex-1 items-center justify-center text-secondary text-sm p-4"
                >
                    Select a snippet to edit, or press + to create a new one.
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.snippets-list-panel {
    max-height: 200px;
}

@media (min-width: 640px) {
    .snippets-list-panel {
        max-height: none;
        width: 15rem;
    }
}
</style>

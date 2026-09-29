<script setup lang="ts">
import { computed, ref } from "vue"
import { useSettings } from "~/composables/useSettings"
import { useFileDrag } from "~/composables/useFileDrag"
import type { ServerRecord } from "~/lib/db"

const props = defineProps<{
    servers: ServerRecord[]
    vaultReady: boolean
}>()

const emit = defineEmits<{
    (e: "connect", server: ServerRecord): void
    (e: "toggleBookmark", id: number): void
    (e: "edit", server: ServerRecord): void
    (e: "remove", id: number): void
    (e: "open-add-modal"): void
    (e: "open-import-ssh-folder"): void
    (e: "unlock-vault"): void
    (e: "openFiles", server: ServerRecord): void
    (
        e: "transferFile",
        payload: {
            fromServer: ServerRecord
            fromPath: string
            fromName: string
            toServer: ServerRecord
        }
    ): void
}>()

const { draggingFile } = useFileDrag()
const dropTargetServerId = ref<number | null>(null)

const searchQuery = ref("")
const searchInputRef = ref<HTMLInputElement | null>(null)

const focusSearch = () => {
    searchInputRef.value?.focus()
}

defineExpose({ focusSearch })

const { settings } = useSettings()
const hideSensitive = computed(() => settings.value.hideSensitive)

const filteredServers = computed(() => {
    if (!searchQuery.value) return props.servers
    const query = searchQuery.value.toLowerCase()
    return props.servers.filter(
        (s: ServerRecord) =>
            s.name.toLowerCase().includes(query) ||
            s.host.toLowerCase().includes(query) ||
            s.username.toLowerCase().includes(query)
    )
})

const bookmarkedServers = computed(() =>
    filteredServers.value.filter((s: ServerRecord) => s.isBookmarked)
)

function onServerDragOver(e: DragEvent, server: ServerRecord) {
    if (!draggingFile.value) return
    if (draggingFile.value.server.id === server.id) return
    e.preventDefault()
    dropTargetServerId.value = server.id ?? null
}
function onServerDragLeave() {
    dropTargetServerId.value = null
}
function onServerDrop(e: DragEvent, server: ServerRecord) {
    e.preventDefault()
    dropTargetServerId.value = null
    const df = draggingFile.value
    if (!df || df.server.id === server.id) return
    emit("transferFile", {
        fromServer: df.server,
        fromPath: df.path,
        fromName: df.name,
        toServer: server,
    })
    draggingFile.value = null
}
</script>

<template>
    <div class="flex flex-col gap-6 sm:gap-8 p-4 sm:p-8 max-w-6xl mx-auto">
        <div class="space-y-4">
            <div
                class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
                <div class="space-y-2">
                    <h1
                        class="text-2xl sm:text-4xl font-bold text-white tracking-tight"
                    >
                        Control Panel
                    </h1>
                    <p class="text-secondary max-w-2xl">
                        Configure servers, import SSH profiles, and open
                        terminal sessions from one place.
                    </p>
                </div>

                <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                        class="ws-btn-primary px-4 py-2 text-sm"
                        :disabled="!props.vaultReady"
                        @click="emit('open-add-modal')"
                    >
                        + Add Server
                    </button>
                    <button
                        class="ws-btn px-4 py-2 text-sm"
                        :disabled="!props.vaultReady"
                        @click="emit('open-import-ssh-folder')"
                    >
                        Import .ssh
                    </button>
                </div>
            </div>

            <div
                class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-(--border) pt-4"
            >
                <div
                    v-if="props.servers.length > 0"
                    class="relative w-full sm:w-64"
                >
                    <input
                        ref="searchInputRef"
                        v-model="searchQuery"
                        id="search-query"
                        name="search-query"
                        type="search"
                        autocomplete="off"
                        autocapitalize="none"
                        autocorrect="off"
                        spellcheck="false"
                        placeholder="Search servers..."
                        class="ws-input pr-8"
                    />
                    <div
                        class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    >
                        <button
                            v-if="searchQuery"
                            class="pointer-events-auto hover:text-white"
                            @click="searchQuery = ''"
                            aria-label="Clear search"
                        >
                            <span aria-hidden="true">×</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <section class="space-y-6">
            <div class="flex items-center justify-between gap-4">
                <h2 class="text-sm font-bold uppercase tracking-widest">
                    Bookmarked Servers
                </h2>
                <span class="text-xxs text-secondary"
                    >{{ bookmarkedServers.length }} saved</span
                >
            </div>

            <div v-if="bookmarkedServers.length > 0" class="grid gap-3">
                <button
                    v-for="server in bookmarkedServers"
                    :key="server.id"
                    class="group text-left p-4 border border-(--border) rounded hover:border-(--border-light) hover:bg-(--surface-alt) transition-all relative"
                    :class="
                        dropTargetServerId === server.id
                            ? 'border-cyan-500/60 bg-cyan-500/5'
                            : ''
                    "
                    @click="emit('connect', server)"
                    @dragover="(e) => onServerDragOver(e, server)"
                    @dragleave="onServerDragLeave"
                    @drop="(e) => onServerDrop(e, server)"
                >
                    <!-- Drop overlay -->
                    <div
                        v-if="dropTargetServerId === server.id"
                        class="absolute inset-0 flex items-center justify-center rounded pointer-events-none z-10"
                    >
                        <span
                            class="text-cyan-400 text-xs font-semibold bg-black/70 px-3 py-1 rounded"
                            >↗ Transfer here</span
                        >
                    </div>
                    <div class="flex items-start justify-between gap-4">
                        <div class="min-w-0">
                            <h3
                                class="font-semibold text-white truncate group-hover:text-white"
                            >
                                {{ server.name }}
                            </h3>
                            <p class="text-xxs font-mono truncate">
                                {{ server.username }}@{{
                                    hideSensitive ? "•••" : server.host
                                }}:{{ server.port }}
                            </p>
                        </div>
                        <button
                            class="transition-colors"
                            title="Toggle bookmark"
                            @click.stop="emit('toggleBookmark', server.id!)"
                        >
                            <span
                                class="w-4 h-4"
                                :class="
                                    server.isBookmarked
                                        ? 'text-yellow-400'
                                        : 'text-secondary'
                                "
                                aria-hidden="true"
                                >★</span
                            >
                        </button>
                    </div>
                    <div class="mt-3 flex justify-between items-center">
                        <button
                            class="ws-btn text-xs px-3 py-1 text-cyan-400 border-cyan-500/40 hover:border-cyan-400"
                            @click.stop="emit('openFiles', server)"
                        >
                            Files
                        </button>
                        <span
                            class="text-xxs text-secondary group-hover:text-white transition-colors"
                        >
                            <span class="inline-block" aria-hidden="true"
                                >→</span
                            >
                        </span>
                    </div>
                </button>
            </div>

            <div
                v-else
                class="rounded border border-(--border) bg-(--surface) p-6 text-center text-secondary"
            >
                <p class="font-semibold text-white mb-2">
                    No bookmarked servers yet
                </p>
                <p class="text-sm">
                    Bookmark your most used servers here for quick access.
                </p>
            </div>
        </section>

        <section class="space-y-4">
            <div class="flex items-center justify-between gap-4">
                <div>
                    <h2 class="text-sm font-bold uppercase tracking-widest">
                        All Servers
                    </h2>
                    <p class="text-xxs text-secondary">
                        {{ filteredServers.length }} profiles
                        {{ searchQuery ? "matching search" : "configured" }}
                    </p>
                </div>

                <div
                    class="text-xxs text-secondary hidden sm:flex sm:items-center sm:gap-4"
                >
                    <span class="hidden sm:inline"
                        >Use the buttons to connect, edit, delete, or
                        bookmark.</span
                    >
                </div>
            </div>

            <div v-if="filteredServers.length > 0" class="grid gap-3">
                <div
                    v-for="server in filteredServers"
                    :key="server.id"
                    class="group relative rounded border border-(--border) bg-(--surface) p-4 hover:border-(--border-light) hover:bg-(--surface-alt) transition-all"
                    :class="
                        dropTargetServerId === server.id
                            ? 'border-cyan-500/60 bg-cyan-500/5'
                            : ''
                    "
                    @dragover="(e) => onServerDragOver(e, server)"
                    @dragleave="onServerDragLeave"
                    @drop="(e) => onServerDrop(e, server)"
                >
                    <!-- Drop overlay -->
                    <div
                        v-if="dropTargetServerId === server.id"
                        class="absolute inset-0 flex items-center justify-center rounded pointer-events-none z-10"
                    >
                        <span
                            class="text-cyan-400 text-xs font-semibold bg-black/70 px-3 py-1 rounded"
                            >↗ Transfer here</span
                        >
                    </div>
                    <div
                        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div class="min-w-0 space-y-1">
                            <p class="font-semibold text-white truncate">
                                {{ server.name }}
                            </p>
                            <p class="text-xxs font-mono truncate">
                                {{ server.username }}@{{
                                    hideSensitive ? "•••" : server.host
                                }}:{{ server.port }}
                            </p>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <button
                                class="transition-colors"
                                title="Toggle bookmark"
                                @click.stop="emit('toggleBookmark', server.id!)"
                            >
                                <span
                                    class="w-4 h-4"
                                    :class="
                                        server.isBookmarked
                                            ? 'text-yellow-400'
                                            : 'text-secondary'
                                    "
                                    aria-hidden="true"
                                >
                                    {{ server.isBookmarked ? "★" : "☆" }}
                                </span>
                            </button>
                            <button
                                class="text-secondary hover:text-white text-xs p-1"
                                title="Edit server"
                                @click.stop="emit('edit', server)"
                                aria-label="Edit server"
                            >
                                <span class="text-secondary" aria-hidden="true"
                                    >✎</span
                                >
                            </button>
                            <button
                                class="text-red-500/70 hover:text-red-400 text-xs p-1"
                                title="Delete server"
                                @click.stop="emit('remove', server.id!)"
                                aria-label="Delete server"
                            >
                                <span class="text-red-500/70" aria-hidden="true"
                                    >×</span
                                >
                            </button>
                            <button
                                class="ws-btn text-xs px-3 py-1 text-cyan-400 border-cyan-500/40 hover:border-cyan-400"
                                @click.stop="emit('openFiles', server)"
                            >
                                Files
                            </button>
                            <button
                                class="ws-btn text-xs px-3 py-1 group-hover:border-white group-hover:text-white"
                                @click.stop="emit('connect', server)"
                            >
                                Connect
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div
                v-else
                class="rounded border border-(--border) bg-(--surface) p-6 text-center text-secondary"
            >
                <p class="font-semibold text-white mb-2">
                    {{
                        searchQuery
                            ? "No servers match your search"
                            : "No servers configured"
                    }}
                </p>
                <p class="text-sm">
                    {{
                        searchQuery
                            ? "Try a different search term or clear the filter."
                            : "Add a new server or import your SSH configuration to get started."
                    }}
                </p>
                <button
                    v-if="searchQuery"
                    class="mt-4 ws-btn text-xs"
                    @click="searchQuery = ''"
                >
                    Clear Search
                </button>
            </div>
        </section>
    </div>
</template>

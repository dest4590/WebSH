<script setup lang="ts">
import {
    ref,
    computed,
    isRef,
    type Ref,
    watch,
    onMounted,
    onUnmounted,
} from "vue"
import { useSharedFileManager } from "~/composables/useFileManager"
import { useDialog } from "~/composables/useDialog"
import { useSettings } from "~/composables/useSettings"
import { useFileDrag } from "~/composables/useFileDrag"
import type { ServerRecord } from "~/lib/db"

const props = defineProps<{
    server: ServerRecord | null
    masterPassword: string | Ref<string>
    managerKey: string
}>()

const { showConfirm } = useDialog()
const { settings } = useSettings()
const { draggingFile } = useFileDrag()
const displayHost = computed(() =>
    props.server
        ? settings.value.hideSensitive
            ? "•••"
            : props.server.host
        : null
)

const masterPasswordRef = computed(() =>
    isRef(props.masterPassword)
        ? props.masterPassword.value
        : props.masterPassword
)

const fm = useSharedFileManager(masterPasswordRef, props.managerKey)

const dragOver = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const search = ref("")
type SortKey = "name" | "size" | "modifiedAt"
const sortKey = ref<SortKey>("name")
const sortAsc = ref(true)

function setSort(key: SortKey) {
    if (sortKey.value === key) sortAsc.value = !sortAsc.value
    else {
        sortKey.value = key
        sortAsc.value = key === "name"
    }
}

const filteredFiles = computed(() => {
    const q = search.value.toLowerCase()
    let list = q
        ? fm.files.value.filter((f) => f.name.toLowerCase().includes(q))
        : [...fm.files.value]
    list.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        let cmp = 0
        if (sortKey.value === "name") cmp = a.name.localeCompare(b.name)
        else if (sortKey.value === "size") cmp = a.size - b.size
        else cmp = a.modifiedAt - b.modifiedAt
        return sortAsc.value ? cmp : -cmp
    })
    return list
})

const fileCount = computed(() => {
    const dirs = fm.files.value.filter((f) => f.isDir).length
    const files = fm.files.value.length - dirs
    const parts: string[] = []
    if (dirs > 0) parts.push(`${dirs} folder${dirs !== 1 ? "s" : ""}`)
    if (files > 0) parts.push(`${files} file${files !== 1 ? "s" : ""}`)
    return parts.join(", ") || "Empty"
})

const isErrorStatus = computed(() =>
    /failed|error|lost|disconnect/i.test(fm.status.value)
)

const EXT_COLORS: Record<string, string> = {
    js: "text-yellow-300",
    ts: "text-blue-300",
    py: "text-green-300",
    rs: "text-orange-300",
    go: "text-cyan-300",
    c: "text-purple-300",
    cpp: "text-purple-300",
    h: "text-purple-300",
    sh: "text-emerald-300",
    rb: "text-red-300",
    php: "text-indigo-300",
    html: "text-orange-400",
    css: "text-pink-300",
    json: "text-amber-300",
    yaml: "text-amber-300",
    yml: "text-amber-300",
    toml: "text-amber-300",
    xml: "text-orange-300",
    md: "text-sky-300",
    png: "text-pink-400",
    jpg: "text-pink-400",
    jpeg: "text-pink-400",
    gif: "text-pink-400",
    svg: "text-pink-400",
    webp: "text-pink-400",
    mp4: "text-violet-400",
    mp3: "text-violet-400",
    mkv: "text-violet-400",
    zip: "text-yellow-400",
    tar: "text-yellow-400",
    gz: "text-yellow-400",
    xz: "text-yellow-400",
    bz2: "text-yellow-400",
    pdf: "text-red-400",
    txt: "text-gray-300",
}

function fileColor(name: string, isDir: boolean): string {
    if (isDir) return "text-blue-300"
    const ext = name.split(".").pop()?.toLowerCase() ?? ""
    return EXT_COLORS[ext] ?? "text-white"
}

function fileIcon(name: string, isDir: boolean): string {
    if (isDir) return "📁"
    const ext = name.split(".").pop()?.toLowerCase() ?? ""
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "🖼️"
    if (["mp4", "mkv", "avi", "mov"].includes(ext)) return "🎬"
    if (["mp3", "wav", "flac", "ogg"].includes(ext)) return "🎵"
    if (["zip", "tar", "gz", "xz", "bz2", "7z"].includes(ext)) return "📦"
    if (["pdf"].includes(ext)) return "📕"
    if (["sh", "bash", "zsh"].includes(ext)) return "⚙️"
    return "📄"
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(ts: number): string {
    if (!ts) return "—"
    const d = new Date(ts)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString()
}

function fullDate(ts: number): string {
    if (!ts) return ""
    return new Date(ts).toLocaleString()
}

function joinPath(name: string): string {
    return fm.currentPath.value === "/"
        ? `/${name}`
        : `${fm.currentPath.value}/${name}`
}

async function clickEntry(name: string, isDir: boolean) {
    if (isDir) {
        clearSelection()
        await fm.navigateTo(joinPath(name))
    }
}

async function handleDownload(name: string) {
    await fm.downloadFile(joinPath(name), name)
}

async function handleDelete(name: string, isDir: boolean) {
    const confirmed = await showConfirm(
        `Delete "${name}"? This cannot be undone.`,
        { title: "Confirm Delete", okLabel: "Delete", cancelLabel: "Cancel" }
    )
    if (!confirmed) return
    await fm.deleteFile(joinPath(name), isDir)
}

function onFileDragStart(e: DragEvent, name: string, isDir: boolean) {
    if (isDir || !props.server) return
    const path = joinPath(name)
    draggingFile.value = { server: props.server, path, name, isDir }
    e.dataTransfer?.setData(
        "application/websh-file",
        JSON.stringify({ path, name })
    )
    e.dataTransfer && (e.dataTransfer.effectAllowed = "copy")
}
function onFileDragEnd() {
    setTimeout(() => {
        draggingFile.value = null
    }, 200)
}

function onDragOver(e: DragEvent) {
    e.preventDefault()
    dragOver.value = true
}
function onDragLeave() {
    dragOver.value = false
}
async function onDrop(e: DragEvent) {
    e.preventDefault()
    dragOver.value = false
    const fileList = e.dataTransfer?.files
    if (!fileList) return
    for (const file of Array.from(fileList))
        await fm.uploadFile(fm.currentPath.value, file)
}

function triggerUpload() {
    fileInputRef.value?.click()
}
async function onFileInput(e: Event) {
    const input = e.target as HTMLInputElement
    const fileList = input.files
    if (!fileList) return
    for (const file of Array.from(fileList))
        await fm.uploadFile(fm.currentPath.value, file)
    input.value = ""
}

async function onKeyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "INPUT") return
    if (e.key === "Escape") {
        clearSelection()
        return
    }
    if (e.key === "Backspace" && fm.currentPath.value !== "/") {
        e.preventDefault()
        await fm.navigateUp()
    }
}

async function ensureSession() {
    const server = props.server
    if (!server || fm.connectionState.value === "connecting") {
        return
    }

    if (server.id !== fm.activeServer.value?.id) {
        await fm.openFor(server)
        return
    }

    if (fm.connectionState.value !== "connected") {
        await fm.reconnectActiveSession()
    }
}

function handleVisibleReconnect() {
    if (document.visibilityState === "hidden") {
        return
    }

    void ensureSession()
}

function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
        void ensureSession()
    }
}

onMounted(() => {
    window.addEventListener("keydown", onKeyDown)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleVisibleReconnect)
    window.addEventListener("pageshow", handleVisibleReconnect)
    void ensureSession()
})
onUnmounted(() => {
    window.removeEventListener("keydown", onKeyDown)
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    window.removeEventListener("focus", handleVisibleReconnect)
    window.removeEventListener("pageshow", handleVisibleReconnect)
    fm.release()
})

watch(
    () => props.server,
    async (s, prev) => {
        search.value = ""
        clearSelection()

        if (!s) {
            await fm.closeSession()
            return
        }

        if (s.id !== prev?.id) {
            await fm.openFor(s)
            return
        }

        if (fm.connectionState.value !== "connected") {
            await fm.reconnectActiveSession()
        }
    }
)

const selected = ref<Set<string>>(new Set())

function toggleSelect(name: string) {
    const s = new Set(selected.value)
    if (s.has(name)) s.delete(name)
    else s.add(name)
    selected.value = s
}

const selectableFiles = computed(() =>
    filteredFiles.value.filter((f) => !f.isDir)
)
const allSelected = computed(
    () =>
        selectableFiles.value.length > 0 &&
        selectableFiles.value.every((f) => selected.value.has(f.name))
)
function toggleSelectAll() {
    if (allSelected.value) {
        selected.value = new Set()
    } else {
        selected.value = new Set(selectableFiles.value.map((f) => f.name))
    }
}

function clearSelection() {
    selected.value = new Set()
}

async function downloadSelected() {
    for (const name of selected.value) {
        await fm.downloadFile(joinPath(name), name)
    }
}

async function deleteSelected() {
    const names = [...selected.value]
    const confirmed = await showConfirm(
        `Delete ${names.length} file${names.length !== 1 ? "s" : ""}? This cannot be undone.`,
        { title: "Confirm Delete", okLabel: "Delete", cancelLabel: "Cancel" }
    )
    if (!confirmed) return
    for (const name of names) {
        const file = fm.files.value.find((f) => f.name === name)
        if (file) await fm.deleteFile(joinPath(name), file.isDir)
    }
    clearSelection()
}

const breadcrumbs = computed(() => {
    const parts = fm.currentPath.value.split("/").filter(Boolean)
    const crumbs: { label: string; path: string }[] = [
        { label: "/", path: "/" },
    ]
    let built = ""
    for (const p of parts) {
        built += `/${p}`
        crumbs.push({ label: p, path: built })
    }
    return crumbs
})

const goUp = async () => {
    fm.navigateUp()
    clearSelection()
}
</script>

<template>
    <div class="flex flex-col h-full text-xs font-mono select-none">
        <div
            class="flex flex-col gap-2 px-8 pt-8 pb-4 border-b border-(--border) shrink-0"
        >
            <div class="flex items-start justify-between">
                <div>
                    <h1 class="text-4xl font-bold text-white tracking-tight">
                        Files
                    </h1>
                    <p class="mt-2 text-secondary">
                        Browse and transfer files on the connected server.
                    </p>
                </div>
                <div v-if="!server" class="text-secondary text-xs mt-1">
                    Connect to a server to browse its files.
                </div>
                <div v-else class="flex items-center gap-2 mt-1">
                    <span class="text-secondary">Server:</span>
                    <span class="text-cyan-400 font-semibold">{{
                        displayHost
                    }}</span>
                    <svg
                        v-if="fm.loading.value"
                        class="animate-spin h-3.5 w-3.5 text-secondary"
                        viewBox="0 0 24 24"
                        fill="none"
                    >
                        <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                        />
                        <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z"
                        />
                    </svg>
                </div>
            </div>

            <div class="flex items-center gap-2 pt-1">
                <div
                    class="flex items-center gap-0.5 text-secondary flex-1 min-w-0 overflow-x-auto"
                >
                    <template
                        v-for="(crumb, i) in breadcrumbs"
                        :key="crumb.path"
                    >
                        <span v-if="i > 1" class="text-secondary/30 mx-0.5"
                            >/</span
                        >
                        <button
                            class="hover:text-white transition-colors shrink-0 px-0.5 rounded"
                            :class="
                                i === breadcrumbs.length - 1
                                    ? 'text-white'
                                    : 'text-secondary'
                            "
                            @click="fm.navigateTo(crumb.path)"
                        >
                            {{ crumb.label }}
                        </button>
                    </template>
                </div>

                <div class="relative shrink-0">
                    <input
                        v-model="search"
                        type="text"
                        placeholder="Filter…"
                        class="bg-(--bg) border border-(--border) rounded px-2 py-1 text-xxs text-white placeholder-secondary/50 w-28 focus:outline-none focus:border-cyan-500/60 transition-colors"
                    />
                    <button
                        v-if="search"
                        class="absolute right-1.5 top-1/2 -translate-y-1/2 text-secondary hover:text-white transition-colors"
                        @click="search = ''"
                    >
                        ✕
                    </button>
                </div>

                <button
                    class="ws-btn py-1 px-3 text-xxs shrink-0"
                    :disabled="fm.loading.value || !server"
                    @click="triggerUpload"
                >
                    ↑ Upload
                </button>
                <input
                    ref="fileInputRef"
                    type="file"
                    multiple
                    class="hidden"
                    @change="onFileInput"
                />
            </div>

            <div
                v-if="fm.status.value"
                class="text-xxs flex items-center gap-1.5"
                :class="isErrorStatus ? 'text-red-400' : 'text-emerald-400'"
            >
                <span>{{ fm.status.value }}</span>
            </div>
        </div>

        <div
            class="flex-1 overflow-y-auto relative"
            :class="{ 'ring-2 ring-inset ring-blue-500/40': dragOver }"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
        >
            <div
                v-if="dragOver"
                class="absolute inset-0 flex items-center justify-center bg-black/60 z-20 pointer-events-none"
            >
                <div class="flex flex-col items-center gap-2 text-blue-400">
                    <span class="text-3xl">⬆</span>
                    <span class="text-sm font-semibold">Drop to upload</span>
                </div>
            </div>

            <div
                v-if="fm.loading.value && fm.files.value.length === 0"
                class="px-8 py-4 space-y-1.5"
            >
                <div
                    v-for="i in 8"
                    :key="i"
                    class="h-7 rounded bg-white/5 animate-pulse"
                    :style="{ opacity: 1 - i * 0.09 }"
                />
            </div>

            <div
                v-else-if="!server"
                class="flex items-center justify-center h-48 text-secondary"
            >
                Connect to a server first
            </div>

            <div
                v-else-if="!fm.loading.value && fm.files.value.length === 0"
                class="flex flex-col items-center justify-center h-48 gap-2 text-secondary"
            >
                <span class="text-2xl opacity-40">📂</span>
                <span>Empty directory</span>
            </div>

            <div
                v-else-if="filteredFiles.length === 0 && search"
                class="flex flex-col items-center justify-center h-48 gap-2 text-secondary"
            >
                <span class="text-2xl opacity-40">🔍</span>
                <span>No matches for "{{ search }}"</span>
            </div>

            <table v-else class="w-full">
                <thead
                    class="sticky top-0 bg-(--bg) border-b border-(--border) z-10"
                >
                    <tr class="text-secondary">
                        <th class="w-8 px-3 py-2">
                            <input
                                type="checkbox"
                                :checked="allSelected"
                                :indeterminate="
                                    selected.size > 0 && !allSelected
                                "
                                class="cursor-pointer accent-cyan-400"
                                @change="toggleSelectAll"
                            />
                        </th>
                        <th class="text-left px-4 py-2 font-normal">
                            <button
                                class="flex items-center gap-1 hover:text-white transition-colors"
                                @click="setSort('name')"
                            >
                                Name
                                <span class="text-secondary/40 text-xxs">
                                    {{
                                        sortKey === "name"
                                            ? sortAsc
                                                ? "↑"
                                                : "↓"
                                            : "↕"
                                    }}
                                </span>
                            </button>
                        </th>
                        <th class="text-right px-4 py-2 font-normal w-24">
                            <button
                                class="flex items-center gap-1 ml-auto hover:text-white transition-colors"
                                @click="setSort('size')"
                            >
                                <span class="text-secondary/40 text-xxs">
                                    {{
                                        sortKey === "size"
                                            ? sortAsc
                                                ? "↑"
                                                : "↓"
                                            : "↕"
                                    }}
                                </span>
                                Size
                            </button>
                        </th>
                        <th class="text-right px-4 py-2 font-normal w-28">
                            <button
                                class="flex items-center gap-1 ml-auto hover:text-white transition-colors"
                                @click="setSort('modifiedAt')"
                            >
                                <span class="text-secondary/40 text-xxs">
                                    {{
                                        sortKey === "modifiedAt"
                                            ? sortAsc
                                                ? "↑"
                                                : "↓"
                                            : "↕"
                                    }}
                                </span>
                                Modified
                            </button>
                        </th>
                        <th class="w-32 px-4 py-2" />
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-if="fm.currentPath.value !== '/'"
                        class="hover:bg-white/5 transition-colors cursor-pointer border-b border-(--border)/20"
                        @click="goUp"
                    >
                        <td class="px-3 py-1.5" />
                        <td class="px-4 py-1.5" colspan="4">
                            <span class="mr-2 opacity-60">📁</span>
                            <span class="text-secondary">..</span>
                            <span class="ml-2 text-secondary/40 text-xxs"
                                >← Backspace</span
                            >
                        </td>
                    </tr>

                    <tr
                        v-for="file in filteredFiles"
                        :key="file.name"
                        class="hover:bg-white/5 transition-colors group border-b border-(--border)/20"
                        :class="[
                            file.isDir ? 'cursor-pointer' : 'cursor-default',
                            selected.has(file.name) ? 'bg-cyan-500/5' : '',
                        ]"
                        :draggable="!file.isDir"
                        @click="clickEntry(file.name, file.isDir)"
                        @dragstart="
                            (e) => onFileDragStart(e, file.name, file.isDir)
                        "
                        @dragend="onFileDragEnd"
                    >
                        <td class="w-8 px-3 py-1.5" @click.stop>
                            <input
                                v-if="!file.isDir"
                                type="checkbox"
                                :checked="selected.has(file.name)"
                                class="cursor-pointer accent-cyan-400"
                                @change="toggleSelect(file.name)"
                            />
                        </td>
                        <td class="px-4 py-1.5">
                            <span class="mr-2">{{
                                fileIcon(file.name, file.isDir)
                            }}</span>
                            <span :class="fileColor(file.name, file.isDir)">{{
                                file.name
                            }}</span>
                        </td>
                        <td
                            class="px-4 py-1.5 text-right text-secondary whitespace-nowrap tabular-nums"
                        >
                            {{ file.isDir ? "—" : formatSize(file.size) }}
                        </td>
                        <td
                            class="px-4 py-1.5 text-right text-secondary whitespace-nowrap"
                            :title="fullDate(file.modifiedAt)"
                        >
                            {{ formatDate(file.modifiedAt) }}
                        </td>
                        <td class="px-4 py-1.5 text-right whitespace-nowrap">
                            <div
                                class="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1"
                            >
                                <button
                                    v-if="!file.isDir"
                                    class="ws-btn py-0.5 px-2 text-xxs"
                                    title="Download"
                                    @click.stop="handleDownload(file.name)"
                                >
                                    ↓
                                </button>
                                <button
                                    class="ws-btn py-0.5 px-2 text-xxs text-red-400 hover:text-red-300"
                                    title="Delete"
                                    @click.stop="
                                        handleDelete(file.name, file.isDir)
                                    "
                                >
                                    ✕
                                </button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <Transition
            enter-active-class="transition-all duration-150"
            enter-from-class="translate-y-full opacity-0"
            leave-active-class="transition-all duration-150"
            leave-to-class="translate-y-full opacity-0"
        >
            <div
                v-if="selected.size > 0"
                class="px-8 py-2 border-t border-cyan-500/30 bg-cyan-500/5 text-xxs shrink-0 flex items-center gap-3"
            >
                <span class="text-cyan-300 font-semibold"
                    >{{ selected.size }} selected</span
                >
                <button
                    class="ws-btn py-1 px-3 text-xxs"
                    :disabled="fm.loading.value"
                    @click="downloadSelected"
                >
                    ↓ Download all
                </button>
                <button
                    class="ws-btn py-1 px-3 text-xxs text-red-400 hover:text-red-300"
                    :disabled="fm.loading.value"
                    @click="deleteSelected"
                >
                    ✕ Delete all
                </button>
                <button
                    class="ml-auto text-secondary hover:text-white transition-colors"
                    @click="clearSelection"
                >
                    Escape to deselect
                </button>
            </div>
        </Transition>

        <div
            class="px-8 py-1.5 border-t border-(--border) text-secondary text-xxs shrink-0 flex items-center justify-between"
        >
            <span
                >{{ fileCount
                }}{{ search ? ` · filtered by "${search}"` : "" }}</span
            >
            <span class="opacity-50"
                >Backspace to go up · Drag &amp; drop to upload</span
            >
        </div>
    </div>
</template>

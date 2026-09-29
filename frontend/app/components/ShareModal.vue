<script setup lang="ts">
import { ref, computed } from "vue"
import ToggleSwitch from "~/components/ToggleSwitch.vue"
import type { RoomWatcher } from "~/composables/useTerminalShare"

const props = defineProps<{
    shareUrl: string | null
    expiresInSecs: number | null
    remainingSecs: number | null
    isCreating: boolean
    isExpired: boolean
    error: string | null
    readOnly: boolean
    watchers: RoomWatcher[]
}>()

const emit = defineEmits<{
    (e: "close"): void
    (e: "stop"): void
    (e: "update:readOnly", value: boolean): void
    (e: "create"): void
    (e: "kick", id: number): void
    (e: "ban", id: number): void
    (e: "setReadOnly", id: number, readOnly: boolean): void
}>()

const copied = ref(false)
const pendingAction = ref<number | null>(null)

async function copyLink() {
    if (!props.shareUrl) return
    try {
        await navigator.clipboard.writeText(props.shareUrl)
        copied.value = true
        setTimeout(() => (copied.value = false), 2000)
    } catch {}
}

async function doKick(id: number) {
    pendingAction.value = id
    emit("kick", id)
    setTimeout(() => (pendingAction.value = null), 1000)
}

async function doBan(id: number) {
    pendingAction.value = id
    emit("ban", id)
    setTimeout(() => (pendingAction.value = null), 1000)
}

const countdownLabel = computed(() => {
    const secs = props.remainingSecs
    if (secs === null) return null
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
})

const countdownUrgent = computed(
    () => props.remainingSecs !== null && props.remainingSecs <= 60
)

const isActive = computed(() => !!props.shareUrl && !props.isExpired)
</script>

<template>
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @mousedown.self="emit('close')"
    >
        <div
            class="relative w-full max-w-md border border-white/20 bg-black p-6 shadow-2xl"
        >
            <div
                class="mb-4 flex items-center justify-between border-b border-white/20 pb-4"
            >
                <h2 class="text-sm font-semibold text-white">Share Terminal</h2>
                <button
                    class="flex h-6 w-6 items-center justify-center rounded text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label="Close"
                    @click="emit('close')"
                >
                    <span aria-hidden="true">×</span>
                </button>
            </div>

            <div
                v-if="!isCreating && !shareUrl && !error && !isExpired"
                class="space-y-4"
            >
                <p class="text-xs text-white/70">
                    Share this terminal session with others via a unique link.
                </p>

                <label
                    class="flex cursor-pointer items-center justify-between gap-3 border-b border-(--border) py-3"
                >
                    <div>
                        <p class="text-xs font-medium text-white">Read-only</p>
                        <p class="mt-0.5 text-xxs">
                            Viewers can only watch, they cannot type commands
                        </p>
                    </div>
                    <ToggleSwitch
                        :model-value="readOnly"
                        @update:model-value="emit('update:readOnly', $event)"
                        aria-label="Toggle read-only mode"
                    />
                </label>

                <button
                    class="w-full border border-emerald-400 bg-emerald-400/10 px-4 py-2 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-400/20"
                    @click="emit('create')"
                >
                    Create Share Link
                </button>
            </div>

            <div v-else-if="isCreating" class="flex items-center gap-3 py-4">
                <span
                    class="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"
                />
                <p class="text-sm text-white/70">Creating share link…</p>
            </div>

            <div v-else-if="error" class="py-2 space-y-3">
                <p class="text-sm text-red-400">{{ error }}</p>
                <button
                    class="text-xs text-white/70 underline hover:text-white"
                    @click="emit('close')"
                >
                    Close
                </button>
            </div>

            <div v-else-if="isExpired" class="space-y-4 py-1">
                <div class="flex items-center gap-2 text-white/70">
                    <span aria-hidden="true">🕒</span>
                    <p class="text-sm font-medium">Share session expired</p>
                </div>
                <p class="text-xs text-white/70">
                    Your free plan share has reached the 10-minute limit.
                    Upgrade to Pro for unlimited session sharing.
                </p>
                <NuxtLink
                    to="/plans"
                    class="block w-full border border-emerald-400 bg-emerald-400/10 px-4 py-2 text-center text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-400/20"
                    @click="emit('close')"
                >
                    View Plans
                </NuxtLink>
                <button
                    class="w-full text-xs text-white/70 hover:text-white"
                    @click="emit('close')"
                >
                    Dismiss
                </button>
            </div>

            <div v-else-if="isActive" class="space-y-4">
                <p class="text-xs text-white/70">
                    Anyone with this link can
                    <span class="text-white">{{
                        readOnly ? "view" : "control"
                    }}</span>
                    your terminal output.
                </p>

                <div
                    class="flex items-center gap-2 border border-white/20 bg-black px-3 py-2"
                >
                    <span
                        class="min-w-0 flex-1 truncate font-mono text-xs text-emerald-400"
                    >
                        {{ shareUrl }}
                    </span>
                    <button
                        class="shrink-0 border border-white/20 px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                        :class="
                            copied
                                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
                                : ''
                        "
                        @click="copyLink"
                    >
                        {{ copied ? "Copied!" : "Copy" }}
                    </button>
                </div>

                <div class="flex items-center justify-between">
                    <span class="text-xs">Session length</span>
                    <span
                        class="font-mono text-xs tabular-nums transition-colors"
                        :class="
                            countdownLabel === null
                                ? 'text-emerald-400'
                                : countdownUrgent
                                  ? 'text-red-400 animate-pulse'
                                  : 'text-white'
                        "
                    >
                        {{ countdownLabel ?? "∞ Unlimited" }}
                    </span>
                </div>

                <div
                    v-if="remainingSecs !== null && expiresInSecs !== null"
                    class="space-y-1.5 border border-white/20 bg-black px-3 py-2"
                >
                    <div class="h-1 w-full overflow-hidden bg-white/20">
                        <div
                            class="h-full bg-white transition-all duration-1000"
                            :style="{
                                width: `${Math.round((remainingSecs / expiresInSecs) * 100)}%`,
                            }"
                        />
                    </div>
                    <p class="text-xxs text-white/70">
                        Free plan shares expire after 10 minutes.
                        <NuxtLink
                            to="/plans"
                            class="underline hover:text-white"
                            @click="emit('close')"
                        >
                            Upgrade to Pro
                        </NuxtLink>
                        for unlimited sharing.
                    </p>
                </div>

                <button
                    class="w-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400 transition-colors hover:bg-red-500/20"
                    @click="emit('stop')"
                >
                    Stop Sharing
                </button>

                <div class="border border-white/10 bg-white/3">
                    <div
                        class="flex items-center justify-between border-b border-white/10 px-3 py-2"
                    >
                        <span
                            class="text-xxs font-medium uppercase tracking-wider text-white/40"
                        >
                            Viewers
                        </span>
                        <span class="text-xxs tabular-nums text-white/40">
                            {{ watchers.length }} connected
                        </span>
                    </div>

                    <div
                        v-if="watchers.length === 0"
                        class="px-3 py-3 text-center text-xxs text-white/30"
                    >
                        No viewers connected yet
                    </div>

                    <ul
                        v-else
                        class="divide-y divide-white/5 max-h-40 overflow-y-auto"
                    >
                        <li
                            v-for="w in watchers"
                            :key="w.id"
                            class="flex items-center gap-2 px-3 py-2"
                        >
                            <span
                                class="flex-1 min-w-0 truncate text-xs text-white/80"
                            >
                                {{ w.displayName }}
                            </span>
                            <span
                                class="shrink-0 rounded px-1.5 py-0.5 text-xxs font-medium"
                                :class="
                                    w.readOnly
                                        ? 'bg-zinc-700/60 text-zinc-400'
                                        : 'bg-amber-500/20 text-amber-400'
                                "
                            >
                                {{ w.readOnly ? "read-only" : "write" }}
                            </span>

                            <button
                                class="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-xxs text-white/50 transition-colors hover:border-white/20 hover:text-white"
                                :title="
                                    w.readOnly
                                        ? 'Allow writing'
                                        : 'Make read-only'
                                "
                                :disabled="pendingAction === w.id"
                                @click="emit('setReadOnly', w.id, !w.readOnly)"
                            >
                                {{ w.readOnly ? "Allow" : "Lock" }}
                            </button>

                            <button
                                class="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-xxs text-white/50 transition-colors hover:border-amber-500/40 hover:text-amber-400"
                                title="Kick user"
                                :disabled="pendingAction === w.id"
                                @click="doKick(w.id)"
                            >
                                Kick
                            </button>

                            <button
                                class="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-xxs text-white/50 transition-colors hover:border-red-500/40 hover:text-red-400"
                                title="Ban user (until room is recreated)"
                                :disabled="pendingAction === w.id"
                                @click="doBan(w.id)"
                            >
                                Ban
                            </button>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</template>

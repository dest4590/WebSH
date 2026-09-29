<script setup lang="ts">
import { computed } from "vue"

const props = defineProps<{
    open?: boolean
    password?: string
    status?: string
    initialized?: boolean
}>()

const emit = defineEmits<{
    (e: "update:password", value: string): void
    (e: "unlock"): void
    (e: "reset"): void
}>()

const open = computed(() => props.open ?? false)
const password = computed(() => props.password ?? "")
const status = computed(() => props.status ?? "")
const initialized = computed(() => props.initialized ?? false)
</script>

<template>
    <teleport to="body">
        <transition name="fade">
            <div
                v-if="open"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/95 px-4"
            >
                <div
                    class="w-full max-w-md border border-white/10 bg-[#050505] p-6 sm:p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                >
                    <div class="mb-6 text-center">
                        <div
                            class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-none border border-white/10 text-white"
                        >
                            <span class="text-2xl">🔐</span>
                        </div>
                        <h2
                            class="text-2xl font-semibold uppercase tracking-[0.08em] text-white"
                        >
                            {{ initialized ? "Unlock Vault" : "Create Vault" }}
                        </h2>
                        <p class="mt-2 text-sm text-white/70">
                            {{
                                initialized
                                    ? "Unlock your vault using the master password."
                                    : "Create a master password to protect your vault."
                            }}
                        </p>
                    </div>

                    <form
                        class="space-y-4"
                        @submit.prevent="emit('unlock')"
                        autocomplete="off"
                        novalidate
                    >
                        <div class="sr-only">
                            <label for="vault-username">Username</label>
                            <input
                                id="vault-username"
                                name="vault-username"
                                type="text"
                                autocomplete="username"
                                tabindex="-1"
                                aria-hidden="true"
                            />
                        </div>
                        <div class="flex flex-col gap-2">
                            <label
                                for="vault-password"
                                class="text-xs uppercase tracking-[0.12em] text-white/50"
                                >Master Password</label
                            >
                            <input
                                id="vault-password"
                                name="vault-password"
                                type="password"
                                :autocomplete="
                                    initialized
                                        ? 'current-password'
                                        : 'new-password'
                                "
                                class="w-full border-b border-white/10 bg-transparent py-3 px-2 text-white placeholder:text-white/25 outline-none focus:border-white"
                                placeholder="••••••••"
                                :value="password"
                                @input="
                                    (event) =>
                                        emit(
                                            'update:password',
                                            (event.target as HTMLInputElement)
                                                .value
                                        )
                                "
                                autofocus
                            />
                        </div>
                        <p v-if="status" class="text-sm text-red-400">
                            {{ status }}
                        </p>

                        <button
                            type="submit"
                            class="mt-4 w-full bg-white py-3 text-sm font-semibold uppercase tracking-[0.12em] text-black cursor-pointer"
                        >
                            {{ initialized ? "Unlock Vault" : "Create Vault" }}
                        </button>

                        <button
                            v-if="initialized && status"
                            type="button"
                            @click="emit('reset')"
                            class="mt-4 w-full rounded bg-red-600 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white hover:bg-red-700"
                        >
                            RESET
                        </button>
                    </form>
                </div>
            </div>
        </transition>
    </teleport>
</template>

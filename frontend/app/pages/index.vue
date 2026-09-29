<script setup lang="ts">
import { onMounted } from "vue"
import AppHeader from "~/components/AppHeader.vue"
import AppFooter from "~/components/AppFooter.vue"
import { useAuth } from "~/composables/useAuth"

definePageMeta({
    title: "WebSH – Browser Shell & Workspace",
    meta: [
        {
            hid: "description",
            name: "description",
            content:
                "WebSH is a browser-native shell and workspace: secure SSH, snippets, terminal tiling, and synced profiles – all client-side.",
        },
    ],
})

const auth = useAuth()

onMounted(() => {
    void auth.restoreSession()
})
</script>

<template>
    <div class="min-h-screen bg-black text-white font-mono">
        <AppHeader :showHomeButton="false" />

        <section class="max-w-6xl mx-auto px-4 sm:px-8 pt-20 pb-12">
            <div class="items-center">
                <div class="flex items-center flex-col gap-6">
                    <h1 class="text-4xl sm:text-5xl md:text-6xl font-bold">
                        WebSH
                    </h1>
                    <h3>Secure browser shell & workspace</h3>
                    <p
                        class="text-secondary text-lg max-w-xl leading-relaxed text-center"
                    >
                        More than an SSH terminal: encrypted vaults, snippets,
                        terminal tiling, workspace sharing, and a fast Rust
                        WebAssembly engine – all running entirely in your
                        browser.
                    </p>

                    <div class="flex flex-wrap items-center gap-3">
                        <NuxtLink
                            to="/app"
                            class="ws-btn-primary px-6 py-2.5 text-xs inline-flex items-center gap-2"
                        >
                            Open App
                        </NuxtLink>

                        <NuxtLink
                            v-if="!auth.isAuthenticated"
                            to="/login"
                            class="ws-btn px-6 py-2.5 text-xs"
                        >
                            Sign In
                        </NuxtLink>

                        <NuxtLink
                            to="/news"
                            class="ws-btn-transparent px-4 py-2 text-xs"
                        >
                            What's New
                        </NuxtLink>
                    </div>
                </div>
            </div>
        </section>

        <section class="max-w-6xl mx-auto px-4 sm:px-8 pb-16">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="p-6 border border-(--border)">
                    <h3 class="font-bold mb-2">Encrypted Vault</h3>
                    <p class="text-secondary text-sm">
                        AES-GCM encryption stored locally. Your master password
                        never leaves the device.
                    </p>
                </div>
                <div class="p-6 border border-(--border)">
                    <h3 class="font-bold mb-2">Snippets & Automation</h3>
                    <p class="text-secondary text-sm">
                        Save and run scripts across servers, with simple GUI
                        controls.
                    </p>
                </div>
                <div class="p-6 border border-(--border)">
                    <h3 class="font-bold mb-2">Workspace Sharing</h3>
                    <p class="text-secondary text-sm">
                        Share terminals or read-only views with teammates, for
                        collaboration and demos.
                    </p>
                </div>
            </div>
        </section>

        <AppFooter />
    </div>
</template>

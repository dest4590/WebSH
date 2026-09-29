<script setup lang="ts">
import { computed, onMounted } from "vue"
import { useRouter } from "vue-router"
import { useAuth } from "~/composables/useAuth"

definePageMeta({
    title: "Plans & Pricing",
    meta: [
        {
            hid: "description",
            name: "description",
            content:
                "Explore WebSH pricing plans for secure browser SSH, encrypted sync, and terminal workspace features.",
        },
    ],
})

const auth = useAuth()
const router = useRouter()

const planTier = computed(
    () => auth.user.value?.subscriptionTier?.toLowerCase() ?? "free"
)
const isPro = computed(() => planTier.value === "pro")

const headerSubtitle = computed(() => {
    if (!auth.isAuthenticated.value) {
        return "Sign in or register to unlock Pro, encrypted sync, and saved settings across devices."
    }
    return isPro.value
        ? "You are on Pro. Enjoy unlimited sessions, encrypted sync, and 24-hour persistence."
        : "You are on Starter. Upgrade anytime for unlimited sessions and synced snippets."
})

const freeButtonLabel = computed(() => {
    if (!auth.isAuthenticated.value) {
        return "Guest mode"
    }
    return isPro.value ? "Downgrade unavailable" : "Current plan"
})

const proButtonLabel = computed(() => {
    // TODO: re-enable Pro upgrade button and dynamic label once payment flow is implemented
    // if (!auth.isAuthenticated.value) {
    //     return "Sign in to upgrade"
    // }
    // return isPro.value ? "Current plan" : "Upgrade to Pro"

    return "Sorry, Pro upgrade is currently unavailable"
})

// TODO: re-enable Pro upgrade button once payment flow is implemented
// const proButtonDisabled = computed(() => isPro.value)
const proButtonDisabled = computed(() => true) // Disable Pro upgrade button until payment flow is implemented

const handleProAction = () => {
    if (!auth.isAuthenticated.value) {
        void router.push("/login")
        return
    }

    // TODO: implement actual upgrade flow
}

onMounted(() => {
    void auth.restoreSession()
})
</script>

<template>
    <AppHeader />

    <div class="min-h-screen p-4 sm:p-8 max-w-6xl mx-auto bg-black text-white">
        <div class="border-b border-white/10 pb-6 mb-10">
            <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight">
                Plans & Pricing
            </h1>
            <p class="mt-3 text-white/60 max-w-2xl">
                {{ headerSubtitle }}
            </p>
        </div>

        <div class="grid gap-4 xl:grid-cols-3">
            <section class="border border-white/10 bg-black p-6">
                <div class="flex items-center justify-between mb-5">
                    <div>
                        <h2
                            class="text-xl font-semibold uppercase tracking-[0.24em] text-white"
                        >
                            Starter
                        </h2>
                        <p class="text-sm text-white/60 mt-1">
                            Best for personal use
                        </p>
                    </div>
                    <span class="text-white/60 text-xs">Free</span>
                </div>
                <div class="text-3xl font-extrabold text-white mb-6">$0</div>
                <ul class="text-sm space-y-3 leading-6 text-white/70 mb-6">
                    <li>Local-only storage</li>
                    <li>Max 2 concurrent SSH sessions</li>
                    <li>5 local command snippets</li>
                    <li>15 minute idle session timeout</li>
                    <li>10 minute shared terminal links</li>
                </ul>
                <button
                    disabled
                    class="w-full py-3 bg-white/10 text-white uppercase tracking-[0.2em]"
                >
                    {{ freeButtonLabel }}
                </button>
            </section>

            <section class="border border-white/10 bg-black p-6 xl:col-span-2">
                <div class="flex items-center justify-between mb-5">
                    <div>
                        <h2
                            class="text-xl font-semibold uppercase tracking-[0.24em] text-white"
                        >
                            Pro
                        </h2>
                        <p class="text-sm text-white/60 mt-1">
                            For professional users and teams
                        </p>
                    </div>
                </div>
                <div class="text-3xl font-extrabold text-white mb-6">
                    $8<span class="text-base font-medium text-white/70">
                        / month</span
                    >
                </div>
                <ul class="text-sm space-y-3 leading-6 text-white/70 mb-6">
                    <li>Unlimited concurrent SSH sessions</li>
                    <li>End-to-end encrypted cloud sync</li>
                    <li>Unlimited snippets & cross-device sync</li>
                    <li>24 hour session persistence</li>
                    <li>Unlimited shared terminal links</li>
                </ul>
                <div class="space-y-3">
                    <button
                        :disabled="proButtonDisabled"
                        @click="handleProAction"
                        class="w-full cursor-pointer py-3 bg-white text-black uppercase tracking-[0.2em]"
                    >
                        {{ proButtonLabel }}
                    </button>
                </div>
            </section>
        </div>

        <section
            id="compare"
            class="mt-12 border border-white/10 bg-black p-4 sm:p-8"
        >
            <div
                class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8"
            >
                <div>
                    <p class="text-sm uppercase text-emerald-400 mb-2">
                        Feature comparison
                    </p>
                    <h2 class="text-2xl sm:text-3xl font-semibold text-white">
                        Pick the plan that matches your workflow
                    </h2>
                </div>
                <p class="max-w-xl text-sm leading-6 text-white/60">
                    Compare core features side-by-side and see why Pro gives you
                    a seamless remote shell experience with secure sync,
                    unlimited sessions, and bigger workspace limits.
                </p>
            </div>

            <div class="overflow-x-auto border border-white/10">
                <div class="min-w-130">
                    <div
                        class="grid grid-cols-3 gap-0 bg-white/5 px-6 py-4 text-xs uppercase tracking-[0.16em] text-white/70"
                    >
                        <span>Feature</span>
                        <span class="text-center">Starter</span>
                        <span class="text-center">Pro</span>
                    </div>
                    <div
                        class="divide-y divide-white/10 bg-black text-xs text-white/80"
                    >
                        <div
                            class="grid grid-cols-3 gap-0 px-6 py-3 items-center"
                        >
                            <span>Concurrent SSH sessions</span>
                            <span class="text-center">2</span>
                            <span class="text-center">Unlimited</span>
                        </div>
                        <div
                            class="grid grid-cols-3 gap-0 px-6 py-3 items-center"
                        >
                            <span>Encrypted cloud sync</span>
                            <span class="text-center">No</span>
                            <span class="text-center">Yes</span>
                        </div>
                        <div
                            class="grid grid-cols-3 gap-0 px-6 py-3 items-center"
                        >
                            <span>Snippet storage</span>
                            <span class="text-center">5 local snippets</span>
                            <span class="text-center">Unlimited, synced</span>
                        </div>
                        <div
                            class="grid grid-cols-3 gap-0 px-6 py-3 items-center"
                        >
                            <span>Session persistence</span>
                            <span class="text-center">15 min idle timeout</span>
                            <span class="text-center">24 hour persistence</span>
                        </div>
                        <div
                            class="grid grid-cols-3 gap-0 px-6 py-3 items-center"
                        >
                            <span>Offline terminal access</span>
                            <span class="text-center">Yes</span>
                            <span class="text-center">Yes</span>
                        </div>
                        <div
                            class="grid grid-cols-3 gap-0 px-6 py-3 items-center"
                        >
                            <span>Terminal sharing</span>
                            <span class="text-center">10 min per link</span>
                            <span class="text-center">Unlimited duration</span>
                        </div>
                        <div
                            class="grid grid-cols-3 gap-0 px-6 py-3 items-center"
                        >
                            <span>Priority support</span>
                            <span class="text-center">No</span>
                            <span class="text-center">Yes</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </div>

    <AppFooter />
</template>

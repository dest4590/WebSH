<script setup lang="ts">
import { computed, reactive, watch } from "vue"
import AppHeader from "~/components/AppHeader.vue"
import AppFooter from "~/components/AppFooter.vue"
import { useAuth } from "~/composables/useAuth"
import { useDialog } from "~/composables/useDialog"
import {
    clearPendingPullAfterLogin,
    requestPullAfterLogin,
} from "~/lib/syncState"

definePageMeta({
    title: "Sign In",
    meta: [
        {
            hid: "description",
            name: "description",
            content:
                "Sign in to WebSH to access your secure browser SSH sessions, encrypted vault, and cloud-synced settings.",
        },
    ],
    middleware: [
        async () => {
            if (import.meta.server) {
                return
            }

            const auth = useAuth()
            const authenticated = await auth.restoreSession()

            if (authenticated) {
                return navigateTo("/app")
            }
        },
    ],
})

const route = useRoute()
const router = useRouter()
const { status, pending, login, register, user } = useAuth()
const { showConfirm } = useDialog()

const mode = ref<"login" | "register">("login")
const form = reactive({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
})

const redirectPath = computed(() => {
    const redirect = route.query.redirect
    return typeof redirect === "string" && redirect.startsWith("/")
        ? redirect
        : "/app"
})

const title = computed(() =>
    mode.value === "login" ? "Sign in to WebSH" : "Create your WebSH account"
)

const subtitle = computed(() =>
    mode.value === "login"
        ? "You can use the console without an account. Sign in if you want features tied to your identity later."
        : "Create an account to use WebSH with an identity for future paid features or saved settings."
)

watch(
    () => [form.email, form.password, form.confirmPassword, mode.value],
    () => {
        if (status.value) {
            status.value = ""
        }
    }
)

const handleSubmit = async () => {
    if (mode.value === "register" && form.password !== form.confirmPassword) {
        status.value = "Passwords do not match."
        return
    }

    const success =
        mode.value === "login"
            ? await login({
                  email: form.email,
                  password: form.password,
              })
            : await register({
                  email: form.email,
                  password: form.password,
                  name: form.name,
              })

    if (success) {
        clearPendingPullAfterLogin()

        if (
            mode.value === "login" &&
            (user.value?.subscriptionTier ?? "free") !== "free"
        ) {
            const shouldPull = await showConfirm(
                "Pull cloud-synced settings, servers, and snippets after you unlock your vault? Cloud data will replace local copies when it exists.",
                {
                    title: "Pull Cloud Data?",
                    okLabel: "Pull After Login",
                    cancelLabel: "Skip",
                    maxWidth: "560px",
                }
            )

            if (shouldPull) {
                requestPullAfterLogin()
            }
        }

        await router.push(redirectPath.value)
    }
}
</script>

<template>
    <div class="min-h-screen bg-black text-white font-mono">
        <AppHeader :showAppButton="false" />

        <section
            class="mx-auto grid min-h-[calc(100vh-96px)] max-w-6xl gap-12 px-4 sm:px-8 py-10 sm:py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center"
        >
            <div class="space-y-8">
                <div class="space-y-4">
                    <p class="text-xxs uppercase tracking-[0.32em]">
                        LOGIN & IDENTITY
                    </p>
                    <h1
                        class="max-w-3xl text-xl sm:text-2xl font-bold leading-[1.02] tracking-tight md:text-3xl"
                    >
                        Login or create an account to access future
                        paid-features.
                    </h1>
                </div>

                <div class="grid gap-4 sm:grid-cols-3">
                    <div class="border border-(--border) bg-(--surface) p-4">
                        <p class="text-xxs uppercase tracking-[0.18em]">
                            Backend
                        </p>
                        <p class="mt-3 text-sm leading-6 text-secondary">
                            Accounts are stored server-side with hashed
                            passwords and JWT sessions, but guests can still use
                            the console.
                        </p>
                    </div>
                    <div class="border border-(--border) bg-(--surface) p-4">
                        <p class="text-xxs uppercase tracking-[0.18em]">
                            Vault
                        </p>
                        <p class="mt-3 text-sm leading-6 text-secondary">
                            Your existing master-password vault stays local and
                            encrypted in your browser.
                        </p>
                    </div>
                    <div class="border border-(--border) bg-(--surface) p-4">
                        <p class="text-xxs uppercase tracking-[0.18em]">
                            Growth
                        </p>
                        <p class="mt-3 text-sm leading-6 text-secondary">
                            Sign in only when you want account-based features or
                            paid plans.
                        </p>
                    </div>
                </div>
            </div>

            <div
                class="border border-(--border-light) bg-[#050505] p-5 sm:p-8 shadow-[0_20px_80px_rgba(0,0,0,0.45)]"
            >
                <div
                    class="flex items-center gap-2 border border-(--border) p-1 text-xxs uppercase tracking-[0.18em] text-secondary"
                >
                    <button
                        type="button"
                        class="flex-1 px-3 py-2 transition-colors cursor-pointer"
                        :class="
                            mode === 'login'
                                ? 'bg-white text-black'
                                : 'hover:bg-white/5'
                        "
                        @click="mode = 'login'"
                    >
                        Sign In
                    </button>
                    <button
                        type="button"
                        class="flex-1 px-3 py-2 transition-colors cursor-pointer"
                        :class="
                            mode === 'register'
                                ? 'bg-white text-black'
                                : 'hover:bg-white/5'
                        "
                        @click="mode = 'register'"
                    >
                        Create Account
                    </button>
                </div>

                <div class="mt-8 space-y-2">
                    <h2 class="text-3xl font-bold tracking-tight">
                        {{ title }}
                    </h2>
                    <p class="text-sm leading-6 text-secondary">
                        {{ subtitle }}
                    </p>
                </div>

                <form class="mt-8 space-y-5" @submit.prevent="handleSubmit">
                    <div class="space-y-2">
                        <label class="ws-label">Email</label>
                        <input
                            v-model="form.email"
                            type="email"
                            autocomplete="email"
                            class="ws-input"
                            placeholder="ops@example.com"
                            required
                        />
                    </div>

                    <div class="space-y-2">
                        <label class="ws-label">Password</label>
                        <input
                            v-model="form.password"
                            type="password"
                            autocomplete="current-password"
                            class="ws-input"
                            placeholder="At least 8 characters"
                            required
                        />
                    </div>

                    <div v-if="mode === 'register'" class="space-y-2">
                        <label class="ws-label">Display name</label>
                        <input
                            v-model="form.name"
                            type="text"
                            autocomplete="name"
                            class="ws-input"
                            placeholder="What should we call you?"
                        />
                    </div>

                    <div v-if="mode === 'register'" class="space-y-2">
                        <label class="ws-label">Confirm Password</label>
                        <input
                            v-model="form.confirmPassword"
                            type="password"
                            autocomplete="new-password"
                            class="ws-input"
                            placeholder="Repeat your password"
                            required
                        />
                    </div>

                    <p v-if="status" class="text-sm text-red-400">
                        {{ status }}
                    </p>

                    <button
                        type="submit"
                        class="ws-btn-primary w-full py-3 text-sm"
                        :disabled="pending"
                    >
                        {{
                            pending
                                ? "Working..."
                                : mode === "login"
                                  ? "Sign In"
                                  : "Create Account"
                        }}
                    </button>

                    <p
                        v-if="mode === 'register'"
                        class="text-center text-xxs text-secondary mt-4"
                    >
                        By creating an account, you agree to our
                        <NuxtLink
                            to="/terms"
                            class="underline underline-offset-2 hover:text-white"
                            >Terms of Service</NuxtLink
                        >
                        and
                        <NuxtLink
                            to="/privacy"
                            class="underline underline-offset-2 hover:text-white"
                            >Privacy Policy</NuxtLink
                        >.
                    </p>
                </form>

                <div class="mt-4 text-center text-xxs">
                    Prefer not to sign in yet?
                    <NuxtLink
                        to="/app"
                        class="text-white underline-offset-4 underline"
                    >
                        Continue as guest
                    </NuxtLink>
                </div>
            </div>
        </section>

        <AppFooter />
    </div>
</template>

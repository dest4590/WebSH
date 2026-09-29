<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useRouter } from "#app"
import AppHeader from "~/components/AppHeader.vue"
import AppFooter from "~/components/AppFooter.vue"
import { useAuth } from "~/composables/useAuth"

definePageMeta({
    title: "Account Profile",
    meta: [
        {
            hid: "description",
            name: "description",
            content:
                "View your WebSH account details, subscription tier, and encrypted vault status.",
        },
    ],
})

const router = useRouter()
const auth = useAuth()

const hasProStatus = computed(
    () => auth.user.value?.subscriptionTier?.toLowerCase() === "pro"
)

const accountLabel = computed(() => {
    if (!auth.user.value) {
        return "Guest"
    }

    return hasProStatus.value ? "PRO Member" : "Free Account"
})

const formattedCreatedAt = computed(() => {
    const createdAt = auth.user.value?.createdAt
    if (!createdAt) {
        return "Unknown"
    }

    const timestamp = Number(createdAt)
    const timestampMs =
        timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp

    return new Date(timestampMs).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    })
})

onMounted(async () => {
    const authenticated = await auth.restoreSession()
    if (!authenticated) {
        await router.push("/login?redirect=/profile")
    }
})

const editingName = ref(false)
const nameValue = ref<string>(auth.user.value?.name ?? "")

watch(
    () => auth.user.value,
    (u) => {
        nameValue.value = u?.name ?? ""
    }
)

const startEdit = () => {
    editingName.value = true
}

const cancelEdit = () => {
    editingName.value = false
    nameValue.value = auth.user.value?.name ?? ""
}

const saveName = async () => {
    if (!auth.updateProfile) return
    const ok = await auth.updateProfile({ name: nameValue.value })
    if (ok) {
        editingName.value = false
    } else {
    }
}
</script>

<template>
    <div class="min-h-screen bg-black text-white font-mono">
        <AppHeader :showAppButton="false" />

        <main class="max-w-5xl mx-auto px-4 sm:px-8 py-12 sm:py-24">
            <div class="space-y-10">
                <div class="space-y-3">
                    <p class="text-xxs uppercase tracking-widest">My Profile</p>
                    <h1 class="text-3xl sm:text-5xl font-bold tracking-tight">
                        Account details
                    </h1>
                    <p class="text-secondary max-w-3xl leading-relaxed text-sm">
                        View your identity, tier, and membership details.
                    </p>
                </div>

                <div
                    class="border border-(--border) bg-(--surface) p-4 sm:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]"
                >
                    <div
                        class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"
                    >
                        <div>
                            <p class="text-xxs uppercase">Account overview</p>
                            <p class="mt-3 text-2xl sm:text-3xl font-bold">
                                {{ accountLabel }}
                            </p>
                        </div>
                        <div
                            class="inline-flex items-center gap-3 border border-white/10 bg-white/5 px-4 py-2 text-xxs uppercase tracking-[0.24em] text-secondary"
                        >
                            <span
                                class="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400"
                                v-if="hasProStatus"
                            />
                            <span>{{
                                hasProStatus
                                    ? "Pro subscription"
                                    : "Free account"
                            }}</span>
                        </div>
                    </div>

                    <div class="mt-8 grid gap-6 md:grid-cols-2">
                        <section
                            class="border border-(--border) bg-black/40 p-6"
                        >
                            <p class="text-xxs uppercase">Email address</p>
                            <p class="mt-3 text-sm text-white break-all">
                                {{ auth.user.value?.email ?? "---" }}
                            </p>
                        </section>

                        <section
                            class="border border-(--border) bg-black/40 p-6"
                        >
                            <p class="text-xxs uppercase">Display name</p>
                            <div class="mt-3 text-sm text-white">
                                <div
                                    v-if="!editingName"
                                    class="flex flex-col items-left gap-3"
                                >
                                    <div class="break-all">
                                        {{
                                            auth.user.value?.name ?? "(not set)"
                                        }}
                                    </div>
                                    <button
                                        class="ws-btn px-3 py-1 text-sm w-fit"
                                        @click="startEdit"
                                    >
                                        Edit
                                    </button>
                                </div>

                                <div v-else class="space-y-2">
                                    <input
                                        v-model="nameValue"
                                        class="ws-input"
                                        placeholder="Display name"
                                    />
                                    <div class="flex gap-2">
                                        <button
                                            class="ws-btn px-3 py-1 text-sm"
                                            @click="saveName"
                                        >
                                            Save
                                        </button>
                                        <button
                                            class="ws-btn px-3 py-1 text-sm"
                                            @click="cancelEdit"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section
                            class="border border-(--border) bg-black/40 p-6"
                        >
                            <p class="text-xxs uppercase">Member since</p>
                            <p class="mt-3 text-sm text-white">
                                {{ formattedCreatedAt }}
                            </p>
                        </section>

                        <section
                            class="border border-(--border) bg-black/40 p-6"
                        >
                            <p class="text-xxs uppercase">Account ID</p>
                            <p class="mt-3 text-sm text-white">
                                {{ auth.user.value?.id ?? "---" }}
                            </p>
                        </section>

                        <section
                            class="border border-(--border) bg-black/40 p-6"
                        >
                            <p class="text-xxs uppercase">Tier</p>
                            <p class="mt-3 text-sm uppercase">
                                {{
                                    auth.user.value?.subscriptionTier ?? "free"
                                }}
                            </p>
                            <p
                                v-if="
                                    auth.user.value?.subscriptionTier != 'free'
                                "
                                class="mt-3 text-sm text-white"
                            >
                                Hi stranger, thank you for being a supporter!
                                <br />
                                <br />
                                Your subscription helps fund ongoing development
                                and maintenance of WebSH.
                                <br />
                                <br />
                                We appreciate your support!
                                <br />
                                - dest4590
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </main>

        <AppFooter />
    </div>
</template>

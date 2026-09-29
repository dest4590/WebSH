<script setup lang="ts">
import { computed, ref, onMounted } from "vue"
import { useRouter } from "#app"
import { useAuth } from "~/composables/useAuth"
import { useNews } from "~/composables/useNews"

const props = defineProps({
    brand: { type: String, default: "WebSH" },
    homeLabel: { type: String, default: "Home" },
    homeHref: { type: String, default: "/" },
    appLabel: { type: String, default: "Launch App" },
    appHref: { type: String, default: "/app" },
    showBrand: { type: Boolean, default: true },
    showHomeButton: { type: Boolean, default: true },
    showAppButton: { type: Boolean, default: true },
    sticky: { type: Boolean, default: true },
})

const router = useRouter()
const auth = useAuth()
const { hasUnread, fetchNews } = useNews()
const mobileMenuOpen = ref(false)

onMounted(() => {
    fetchNews()
})

const goHome = () => {
    router.push(props.homeHref)
    mobileMenuOpen.value = false
}
const goApp = () => {
    router.push(props.appHref)
    mobileMenuOpen.value = false
}
const goProfile = () => {
    router.push("/profile")
    mobileMenuOpen.value = false
}
const goPlans = () => {
    router.push("/plans")
    mobileMenuOpen.value = false
}
const goNews = () => {
    router.push("/news")
    mobileMenuOpen.value = false
}
const hasProStatus = computed(
    () => auth.user.value?.subscriptionTier?.toLowerCase() === "pro"
)

const navClasses = computed(() =>
    [
        "border-b border-(--border) bg-black/95 backdrop-blur-sm",
        props.sticky ? "sticky top-0 z-40" : "",
    ]
        .filter(Boolean)
        .join(" ")
)
</script>

<template>
    <nav :class="navClasses">
        <div class="flex max-w-full items-center justify-between px-4 h-12">
            <div class="flex items-center gap-2">
                <button
                    v-if="showBrand"
                    class="flex items-center gap-2.5 hover:opacity-75 transition-opacity mr-1"
                    @click="goHome"
                >
                    <div
                        class="w-7 h-7 bg-white flex items-center justify-center text-black font-bold text-xs"
                    >
                        &gt;_
                    </div>
                    <span
                        class="text-base font-bold text-white header-desktop-only tracking-tight"
                    >
                        {{ brand }}
                    </span>
                </button>
                <button
                    type="button"
                    class="ws-btn px-3 py-1.5 text-xxs header-desktop-only"
                    @click="goPlans"
                >
                    Plans
                </button>
                <button
                    type="button"
                    class="ws-btn px-3 py-1.5 text-xxs header-desktop-only relative"
                    @click="goNews"
                >
                    News
                    <span
                        v-if="hasUnread"
                        class="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full border border-black shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                    ></span>
                </button>
            </div>

            <div class="flex items-center gap-2">
                <span
                    v-if="hasProStatus"
                    class="header-desktop-only items-center border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xxs uppercase tracking-[0.24em] text-emerald-300"
                >
                    PRO
                </span>
                <button
                    v-if="showHomeButton"
                    type="button"
                    class="ws-btn px-3 py-1.5 text-xxs header-desktop-only"
                    @click="goHome"
                >
                    {{ homeLabel }}
                </button>
                <button
                    v-if="showAppButton"
                    type="button"
                    class="ws-btn px-3 py-1.5 text-xxs header-desktop-only"
                    @click="goApp"
                >
                    {{ appLabel }}
                </button>
                <button
                    v-if="auth.isAuthenticated"
                    type="button"
                    class="ws-btn px-3 py-1.5 text-xxs header-desktop-only"
                    @click="goProfile"
                >
                    My Profile
                </button>
                <slot name="right" />

                <button
                    type="button"
                    class="header-hamburger"
                    :aria-label="mobileMenuOpen ? 'Close menu' : 'Open menu'"
                    @click="mobileMenuOpen = !mobileMenuOpen"
                >
                    <span
                        class="block w-5 h-px bg-white transition-all duration-200"
                        :class="
                            mobileMenuOpen
                                ? 'rotate-45 translate-y-[3.5px]'
                                : ''
                        "
                    />
                    <span
                        class="block w-5 h-px bg-white transition-all duration-200"
                        :class="mobileMenuOpen ? 'opacity-0' : ''"
                    />
                    <span
                        class="block w-5 h-px bg-white transition-all duration-200"
                        :class="
                            mobileMenuOpen
                                ? '-rotate-45 translate-y-[-8.5px]'
                                : ''
                        "
                    />
                </button>
            </div>
        </div>

        <transition name="mobile-menu">
            <div
                v-if="mobileMenuOpen"
                class="header-mobile-menu border-t border-(--border) bg-black flex flex-col"
            >
                <button
                    type="button"
                    class="px-5 py-3.5 text-left text-sm text-secondary hover:text-white hover:bg-white/5 transition-colors border-b border-(--border) flex items-center justify-between"
                    @click="goNews"
                >
                    News
                    <span
                        v-if="hasUnread"
                        class="w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                    ></span>
                </button>
                <button
                    type="button"
                    class="px-5 py-3.5 text-left text-sm text-secondary hover:text-white hover:bg-white/5 transition-colors border-b border-(--border)"
                    @click="goPlans"
                >
                    Plans
                </button>
                <button
                    v-if="showHomeButton"
                    type="button"
                    class="px-5 py-3.5 text-left text-sm text-secondary hover:text-white hover:bg-white/5 transition-colors border-b border-(--border)"
                    @click="goHome"
                >
                    {{ homeLabel }}
                </button>
                <button
                    v-if="showAppButton"
                    type="button"
                    class="px-5 py-3.5 text-left text-sm text-white font-semibold hover:bg-white/10 transition-colors border-b border-(--border)"
                    @click="goApp"
                >
                    {{ appLabel }}
                </button>
                <button
                    v-if="auth.isAuthenticated"
                    type="button"
                    class="px-5 py-3.5 text-left text-sm text-secondary hover:text-white hover:bg-white/5 transition-colors"
                    @click="goProfile"
                >
                    My Profile
                </button>
                <div
                    v-if="hasProStatus"
                    class="px-5 py-3 text-xxs uppercase tracking-[0.24em] text-emerald-300 border-t border-(--border)"
                >
                    PRO Member
                </div>
            </div>
        </transition>
    </nav>
</template>

<style scoped>
.header-desktop-only {
    display: none;
}

.header-hamburger {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 36px;
    height: 36px;
    gap: 5px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
}

.header-mobile-menu {
    display: flex;
}

@media (min-width: 640px) {
    .header-desktop-only {
        display: inline-flex;
    }

    .header-hamburger {
        display: none;
    }

    .header-mobile-menu {
        display: none !important;
    }
}
</style>

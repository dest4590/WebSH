<template>
    <footer class="border-t border-(--border) bg-black">
        <div class="max-w-6xl mx-auto px-4 sm:px-8 py-10 sm:py-12">
            <div
                class="flex flex-col md:flex-row items-center justify-between gap-8"
            >
                <div class="text-xs">
                    &copy; {{ new Date().getFullYear() }} WebSH Project. All
                    rights reserved.
                </div>
                <div class="flex gap-6 text-xs">
                    <NuxtLink
                        to="/status"
                        class="hover:text-secondary transition-colors"
                    >
                        Status
                    </NuxtLink>
                    <NuxtLink
                        to="/privacy"
                        class="hover:text-secondary transition-colors"
                    >
                        Privacy
                    </NuxtLink>
                    <NuxtLink
                        to="/terms"
                        class="hover:text-secondary transition-colors"
                    >
                        Terms
                    </NuxtLink>
                    <NuxtLink
                        to="/refund"
                        class="hover:text-secondary transition-colors"
                    >
                        Refunds
                    </NuxtLink>
                    <a
                        href="https://github.com/WebSH-Labs/"
                        class="hover:text-secondary transition-colors"
                        target="_blank"
                    >
                        GitHub
                    </a>
                </div>
            </div>
        </div>
    </footer>
</template>

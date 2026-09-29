<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"
import { useRoute } from "#app"
import { useAuth } from "~/composables/useAuth"
import {
    typingBadgeBaseStyle,
    typingBadgeNameStyle,
    typingBadgeVisibleStyle,
    useTypingBadges,
} from "~/composables/useTypingBadges"

const route = useRoute()
const code = route.params.code as string
const watchToken = route.query.token as string | undefined

const { user } = useAuth()

const containerRef = ref<HTMLElement | null>(null)
const statusMsg = ref("Connecting…")
const isConnected = ref(false)
const isExpired = ref(false)
const isReadOnly = ref(false)
const missingToken = ref(!watchToken)

const { typingBadges, applyTypingBadge, clearTypingBadges } = useTypingBadges({
    getCursorPos: () => (terminal ? cursorPixelPos(terminal) : null),
    isSuppressed: () => isReadOnly.value,
})

let terminal: import("@xterm/xterm").Terminal | null = null
let fitAddon: import("@xterm/addon-fit").FitAddon | null = null
let ws: WebSocket | null = null
let resizeObserver: ResizeObserver | null = null

const runtimeConfig = useRuntimeConfig()
const displayName = user.value?.name || user.value?.email

function resolveWsBase(): string {
    if (runtimeConfig.public.apiBaseUrl?.trim()) {
        return runtimeConfig.public.apiBaseUrl
            .replace(/\/$/, "")
            .replace("https://", "wss://")
            .replace("http://", "ws://")
    }
    const scheme = window.location.protocol === "https:" ? "wss" : "ws"
    return `${scheme}://${window.location.hostname || "127.0.0.1"}:5151`
}

function cursorPixelPos(
    term: import("@xterm/xterm").Terminal
): { x: number; y: number } | null {
    if (!containerRef.value) return null
    const el = containerRef.value
    const cellW = el.offsetWidth / term.cols
    const cellH = el.offsetHeight / term.rows
    return {
        x: term.buffer.active.cursorX * cellW,
        y: term.buffer.active.cursorY * cellH,
    }
}

onMounted(async () => {
    if (!containerRef.value) return
    if (missingToken.value) return

    const [{ Terminal }, { FitAddon }, { WebLinksAddon }, { Unicode11Addon }] =
        await Promise.all([
            import("@xterm/xterm"),
            import("@xterm/addon-fit"),
            import("@xterm/addon-web-links"),
            import("@xterm/addon-unicode11"),
        ])

    const xterm = new Terminal({
        convertEol: true,
        cursorBlink: true,
        disableStdin: false,
        fontFamily:
            "'JetBrains Mono Nerd', 'JetBrains Mono', IBM Plex Mono, Fira Code, ui-monospace, monospace",
        fontSize: 15,
        theme: {
            background: "#000000",
            foreground: "#f8f8f2",
            cursor: "#f8f8f2",
        },
        allowProposedApi: true,
    })

    const fit = new FitAddon()
    xterm.loadAddon(fit)
    xterm.loadAddon(new WebLinksAddon())
    const unicode = new Unicode11Addon()
    xterm.loadAddon(unicode)
    xterm.unicode.activeVersion = "11"

    xterm.open(containerRef.value)
    fit.fit()
    terminal = xterm
    fitAddon = fit

    resizeObserver = new ResizeObserver(() => fit.fit())
    resizeObserver.observe(containerRef.value)

    const params = new URLSearchParams({ token: watchToken! })
    if (displayName) params.set("display_name", displayName)

    const wsUrl = `${resolveWsBase()}/share/${code}/watch?${params.toString()}`
    ws = new WebSocket(wsUrl)
    ws.binaryType = "arraybuffer"

    const textDecoder = new TextDecoder()
    const textEncoder = new TextEncoder()

    ws.onopen = () => {
        isConnected.value = true
        statusMsg.value = "Viewing live terminal…"
    }

    xterm.onData((data) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        ws.send(textEncoder.encode(data).buffer)
        ws.send(JSON.stringify({ type: "typing", text: data }))
        console.debug("[typing] sent typing event", { text: data })
    })

    ws.onmessage = (event) => {
        if (typeof event.data === "string") {
            try {
                const msg = JSON.parse(event.data)
                if (msg.type === "typing") {
                    const from =
                        typeof msg.from === "string" && msg.from
                            ? msg.from
                            : displayName || "Owner"
                    if (from !== displayName) {
                        applyTypingBadge(from)
                    }
                } else if (msg.type === "permission_update") {
                    isReadOnly.value = !!msg.readOnly
                    statusMsg.value = msg.readOnly
                        ? "Viewing live terminal…"
                        : "Viewing live terminal (write access)"

                    if (msg.readOnly) {
                        clearTypingBadges()
                    }
                }
            } catch {}
            return
        }
        const data =
            event.data instanceof ArrayBuffer
                ? new Uint8Array(event.data)
                : new Uint8Array((event.data as Blob).size)
        xterm.write(textDecoder.decode(data, { stream: true }))
    }

    ws.onerror = () => {
        isConnected.value = false
        statusMsg.value = "Connection error."
        xterm.options.disableStdin = true
    }

    ws.onclose = (event) => {
        isConnected.value = false
        const reason =
            event.reason ||
            (event.code === 4003
                ? "Kicked by owner."
                : event.code === 1008
                  ? "Session rejected."
                  : "Connection closed.")
        statusMsg.value = reason
        xterm.options.disableStdin = true
        xterm.write(`\r\n\x1b[1;31m[WebSH]\x1b[0m ${reason}\r\n`)
    }
})

onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    ws?.close()
    terminal?.dispose()
})

definePageMeta({
    title: "WebSH  Shared Terminal",
    meta: [
        {
            hid: "description",
            name: "description",
            content:
                "View a live shared terminal session in WebSH. Secure browser-based SSH access.",
        },
        {
            hid: "og:title",
            property: "og:title",
            content: "WebSH  Shared Terminal",
        },
        {
            hid: "og:description",
            property: "og:description",
            content:
                "View a live shared terminal session in WebSH. Secure browser-based SSH access.",
        },
        {
            hid: "twitter:card",
            name: "twitter:card",
            content: "summary_large_image",
        },
    ],
})
</script>

<template>
    <div class="flex h-screen flex-col bg-black text-white">
        <header
            class="flex shrink-0 items-center justify-between border-b border-white/10 bg-black px-4 py-2"
        >
            <div class="flex items-center gap-3">
                <NuxtLink
                    to="/"
                    class="text-sm font-semibold text-white transition-colors hover:text-white/80"
                >
                    WebSH
                </NuxtLink>
                <span class="text-white/20">|</span>
                <span class="text-xs text-zinc-400">Shared Terminal</span>
                <span
                    v-if="!missingToken"
                    class="flex items-center gap-1.5 px-2 py-0.5 text-xxs"
                    :class="
                        isConnected
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-zinc-500/15 text-zinc-400'
                    "
                >
                    <span
                        class="h-1.5 w-1.5"
                        :class="isConnected ? 'bg-emerald-400' : 'bg-zinc-500'"
                    />
                    {{ statusMsg }}
                </span>
            </div>

            <NuxtLink
                to="/"
                class="rounded border border-white/10 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-white/20 hover:text-white"
            >
                Open WebSH
            </NuxtLink>
        </header>

        <div
            v-if="missingToken"
            class="flex flex-1 items-center justify-center"
        >
            <div
                class="max-w-sm border border-red-500/30 bg-red-500/10 p-6 text-center"
            >
                <p class="mb-2 text-sm font-semibold text-red-400">
                    Access Denied
                </p>
                <p class="text-xs text-zinc-400">
                    This share link is missing its access token.<br />
                    Make sure you have the full link.
                </p>
            </div>
        </div>

        <div v-else class="relative flex-1 min-h-0 overflow-hidden">
            <div ref="containerRef" class="h-full w-full" />

            <template v-if="!isReadOnly">
                <template v-for="badge in typingBadges" :key="badge.id">
                    <div
                        v-if="badge.visible"
                        class="pointer-events-none absolute z-10 select-none"
                        :style="[
                            typingBadgeBaseStyle,
                            typingBadgeVisibleStyle,
                            { left: badge.x + 'px', top: badge.y + 'px' },
                        ]"
                    >
                        <span :style="typingBadgeNameStyle">{{
                            badge.from
                        }}</span>
                    </div>
                </template>
            </template>
        </div>

        <div
            v-if="isExpired"
            class="shrink-0 border-t border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-300"
        >
            This share session has ended.
            <NuxtLink to="/" class="ml-1 underline hover:text-amber-200">
                Open WebSH
            </NuxtLink>
            to start your own session.
        </div>
    </div>
</template>

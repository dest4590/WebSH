<script setup lang="ts">
import type { FitAddon } from "@xterm/addon-fit"
import type { SearchAddon } from "@xterm/addon-search"
import type { Terminal, IDisposable } from "@xterm/xterm"
import {
    onBeforeUnmount,
    onMounted,
    nextTick,
    ref,
    shallowRef,
    watch,
} from "vue"
import { useSettings } from "~/composables/useSettings"
import { useKeybindings } from "~/composables/useKeybindings"

const props = defineProps<{
    status: string
    theme?: any
}>()

const emit = defineEmits<{
    (e: "data", data: string): void
    (e: "resize", size: { cols: number; rows: number }): void
    (e: "ready", terminal: Terminal): void
    (e: "action", action: string): void
}>()

const { keybindings } = useKeybindings()
const { settings } = useSettings()
const terminalContainer = ref<HTMLElement | null>(null)
const terminal = shallowRef<Terminal | null>(null)
const fitAddon = shallowRef<FitAddon | null>(null)
const searchAddon = shallowRef<SearchAddon | null>(null)
const terminalSubscription = shallowRef<IDisposable | null>(null)
const terminalResizeSubscription = shallowRef<IDisposable | null>(null)

let visibilityTimer: number | null = null

function isTerminalVisible() {
    return terminalContainer.value?.offsetParent !== null
}

function downloadLog() {
    if (!terminal.value) return

    const buffer = terminal.value.buffer.active
    let log = ""
    for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i)
        if (line) {
            log += line.translateToString() + "\n"
        }
    }

    const blob = new Blob([log], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `websh-log-${new Date().toISOString()}.txt`
    a.click()
    URL.revokeObjectURL(url)
}

watch(
    () => props.theme,
    (newTheme) => {
        if (terminal.value && newTheme) {
            terminal.value.options.theme = newTheme
        }
    },
    { deep: true }
)

const bootTerminal = async () => {
    if (!terminalContainer.value || terminal.value) return
    if (!isTerminalVisible()) return

    const [
        { FitAddon },
        { SearchAddon },
        { WebLinksAddon },
        { Unicode11Addon },
        xtermPkg,
    ] = await Promise.all([
        import("@xterm/addon-fit"),
        import("@xterm/addon-search"),
        import("@xterm/addon-web-links"),
        import("@xterm/addon-unicode11"),
        import("@xterm/xterm"),
    ])
    const { Terminal } = xtermPkg

    const preferredFont =
        settings.value?.fontFamily ??
        "'JetBrains Mono Nerd', 'JetBrains Mono', IBM Plex Mono, Fira Code, Cascadia Code, ui-monospace, monospace"

    console.log("bootTerminal: starting", {
        visible: isTerminalVisible(),
        container: terminalContainer.value,
    })

    console.log("bootTerminal: preferredFont", preferredFont)

    const xterm = new Terminal({
        convertEol: true,
        cursorBlink: true,
        cursorInactiveStyle: "bar",
        fontFamily: preferredFont,
        fontSize: settings.value?.fontSize ?? 15,
        letterSpacing: settings.value?.letterSpacing ?? 0.25,
        theme: props.theme || {
            background: "#000000",
            foreground: "#f8f8f2",
            cursor: "#f8f8f2",
            selectionBackground: "#44475a",
            black: "#000000",
            brightBlack: "#6272a4",
            red: "#ff5555",
            brightRed: "#ff6e6e",
            green: "#50fa7b",
            brightGreen: "#69ff94",
            yellow: "#f1fa8c",
            brightYellow: "#ffffa5",
            blue: "#8be9fd",
            brightBlue: "#8be9fd",
            magenta: "#ff79c6",
            brightMagenta: "#ff92d0",
            cyan: "#8be9fd",
            brightCyan: "#8be9fd",
            white: "#f8f8f2",
            brightWhite: "#ffffff",
        },
        allowProposedApi: true,
    })

    const fit = new FitAddon()
    const search = new SearchAddon()
    const webLinks = new WebLinksAddon()
    const unicode11 = new Unicode11Addon()

    xterm.loadAddon(fit)
    xterm.loadAddon(search)
    xterm.loadAddon(webLinks)
    xterm.loadAddon(unicode11)
    xterm.unicode.activeVersion = "11"
    console.log(
        "bootTerminal: unicode addon loaded, activeVersion=",
        xterm.unicode.activeVersion
    )

    xterm.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") return true

        for (const kb of keybindings.value) {
            const keys = kb.keys.split("+")
            const ctrl = keys.includes("Ctrl")
            const shift = keys.includes("Shift")
            const alt = keys.includes("Alt")
            const key = keys[keys.length - 1]?.toUpperCase()

            if (
                event.ctrlKey === ctrl &&
                event.shiftKey === shift &&
                event.altKey === alt &&
                event.key.toUpperCase() === key
            ) {
                emit("action", kb.action)
                event.preventDefault()
                return false
            }
        }

        return true
    })

    try {
        const webFontsMod = await import("@xterm/addon-web-fonts")

        if (typeof webFontsMod.loadFonts === "function") {
            try {
                await webFontsMod.loadFonts(["JetBrains Mono"])
            } catch (_) {}
        } else if (webFontsMod.WebFontsAddon) {
            try {
                const webFontsInstance = new webFontsMod.WebFontsAddon()
                xterm.loadAddon(webFontsInstance)
                await webFontsInstance.loadFonts(["JetBrains Mono"])
            } catch (_) {}
        }
    } catch (_) {
        console.log(
            "bootTerminal: @xterm/addon-web-fonts not available, falling back"
        )
    }

    try {
        if (
            typeof document !== "undefined" &&
            (document as any).fonts &&
            typeof (document as any).fonts.load === "function"
        ) {
            const loadPromise = (document as any).fonts.load(
                '16px "JetBrains Mono"'
            )
            await Promise.race([
                loadPromise,
                new Promise((r) => setTimeout(r, 500)),
            ])
        }
    } catch (e) {
        console.log("bootTerminal: font API error", e)
    }

    xterm.open(terminalContainer.value)
    await nextTick()
    try {
        const containerStyle = window.getComputedStyle(
            terminalContainer.value as Element
        )
        console.log(
            "bootTerminal: container computed fontFamily",
            containerStyle.fontFamily
        )
        const xtermEl = terminalContainer.value?.querySelector(
            ".xterm"
        ) as Element | null
        if (xtermEl) {
            const xtermStyle = window.getComputedStyle(xtermEl)
            console.log(
                "bootTerminal: xterm element computed fontFamily",
                xtermStyle.fontFamily
            )
        }
    } catch (e) {
        console.log("bootTerminal: computed style error", e)
    }
    await nextTick()
    fit.fit()
    window.setTimeout(() => fit.fit(), 50)
    xterm.writeln("\x1b[90m[websh]\x1b[0m system ready.")
    xterm.writeln(
        "\x1b[90m[info]\x1b[0m credentials stay in the browser - relay sees only encrypted ssh bytes."
    )

    terminal.value = xterm
    fitAddon.value = fit
    searchAddon.value = search

    terminalSubscription.value = xterm.onData((input) => {
        emit("data", input)
    })

    terminalResizeSubscription.value = xterm.onResize((size) => {
        if (terminalContainer.value?.offsetParent !== null) {
            emit("resize", size)
        }
    })

    emit("ready", xterm)
}

watch(
    () => settings.value,
    (s) => {
        if (!terminal.value || !s) return
        try {
            ;(terminal.value as any).options.fontSize = s.fontSize
            ;(terminal.value as any).options.fontFamily = s.fontFamily
            ;(terminal.value as any).options.letterSpacing = s.letterSpacing
            ;(terminal.value as any).options.cursorBlink = s.cursorBlink
            fitAddon.value?.fit()
            window.setTimeout(() => fitAddon.value?.fit(), 50)
        } catch (e) {
            console.warn("Failed to apply terminal settings", e)
        }
    },
    { deep: true }
)

function fitTerminal() {
    if (terminalContainer.value?.offsetParent !== null) {
        fitAddon.value?.fit()
        window.setTimeout(() => fitAddon.value?.fit(), 50)
    }
}

function scheduleBoot() {
    if (terminal.value) return

    if (isTerminalVisible()) {
        bootTerminal()
        window.addEventListener("resize", fitTerminal)
        if (visibilityTimer !== null) {
            window.clearInterval(visibilityTimer)
            visibilityTimer = null
        }
        return
    }

    if (visibilityTimer === null) {
        visibilityTimer = window.setInterval(() => {
            if (isTerminalVisible()) {
                bootTerminal()
                window.addEventListener("resize", fitTerminal)
                if (visibilityTimer !== null) {
                    window.clearInterval(visibilityTimer)
                    visibilityTimer = null
                }
            }
        }, 200)
    }
}

onMounted(() => {
    scheduleBoot()
})

onBeforeUnmount(() => {
    terminalSubscription.value?.dispose()
    terminalResizeSubscription.value?.dispose()
    terminal.value?.dispose()
    window.removeEventListener("resize", fitTerminal)
    if (visibilityTimer !== null) {
        window.clearInterval(visibilityTimer)
        visibilityTimer = null
    }
})

defineExpose({
    terminal,
    fitTerminal,
})
</script>

<template>
    <section class="flex flex-col h-full min-h-0 group/terminal">
        <div class="flex-1 relative bg-black overflow-hidden min-h-0">
            <div
                ref="terminalContainer"
                class="h-full w-full p-3 min-h-0 min-w-0"
            ></div>
            <div
                class="absolute top-2 right-2 opacity-0 group-hover/terminal:opacity-100 transition-opacity flex gap-2"
            >
                <button
                    class="ws-btn px-2 py-1 text-[10px] bg-black/50 backdrop-blur-sm border-(--border) hover:border-(--border-light) inline-flex items-center gap-1"
                    title="Download Log"
                    @click="downloadLog"
                >
                    <span aria-hidden="true">⬇</span>
                    Log
                </button>
            </div>
        </div>
    </section>
</template>

<style>
.xterm {
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
}
.xterm .xterm-viewport {
    background-color: transparent !important;
    width: 100% !important;
    height: 100% !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
}
.xterm .xterm-screen {
    display: block;
    width: 100% !important;
    height: 100% !important;
    padding: 4px;
    box-sizing: border-box;
}
</style>

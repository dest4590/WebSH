import { computed, ref, watch } from "vue"

export type AnimationSpeed = "slow" | "normal" | "fast"

export interface AppSettings {
    animationsEnabled: boolean
    animationSpeed: AnimationSpeed
    fontSize: number
    fontFamily: string
    letterSpacing: number
    cursorBlink: boolean
    themeName: string
    autoSyncEnabled: boolean
    hideSensitive: boolean
    preferredNode: string | null
}

const STORAGE_KEY = "websh-settings"
const LEGACY_THEME_KEY = "websh-theme"

const DEFAULT_SETTINGS: AppSettings = {
    animationsEnabled: true,
    animationSpeed: "normal",
    fontSize: 15,
    fontFamily:
        "'JetBrains Mono Nerd', 'JetBrains Mono', IBM Plex Mono, Fira Code, Cascadia Code, ui-monospace, monospace",
    letterSpacing: 0.25,
    cursorBlink: true,
    themeName: "Dracula",
    autoSyncEnabled: true,
    hideSensitive: false,
    preferredNode: null,
}

export const ANIMATION_SPEED_LABELS: Record<AnimationSpeed, string> = {
    slow: "Slow",
    normal: "Normal",
    fast: "Fast",
}

export const ANIMATION_SPEED_DURATION: Record<AnimationSpeed, string> = {
    slow: "0.4s",
    normal: "0.2s",
    fast: "0.08s",
}

function clampNumber(
    value: unknown,
    fallback: number,
    min: number,
    max: number
) {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return fallback
    }

    return Math.min(max, Math.max(min, value))
}

function normalizeSettings(raw: Partial<AppSettings> | null | undefined) {
    const fallbackTheme = import.meta.client
        ? localStorage.getItem(LEGACY_THEME_KEY)?.trim() ||
          DEFAULT_SETTINGS.themeName
        : DEFAULT_SETTINGS.themeName

    return {
        animationsEnabled:
            typeof raw?.animationsEnabled === "boolean"
                ? raw.animationsEnabled
                : DEFAULT_SETTINGS.animationsEnabled,
        animationSpeed:
            raw?.animationSpeed === "slow" ||
            raw?.animationSpeed === "normal" ||
            raw?.animationSpeed === "fast"
                ? raw.animationSpeed
                : DEFAULT_SETTINGS.animationSpeed,
        fontSize: clampNumber(raw?.fontSize, DEFAULT_SETTINGS.fontSize, 8, 40),
        fontFamily:
            typeof raw?.fontFamily === "string" && raw.fontFamily.trim()
                ? raw.fontFamily
                : DEFAULT_SETTINGS.fontFamily,
        letterSpacing: clampNumber(
            raw?.letterSpacing,
            DEFAULT_SETTINGS.letterSpacing,
            0,
            2
        ),
        cursorBlink:
            typeof raw?.cursorBlink === "boolean"
                ? raw.cursorBlink
                : DEFAULT_SETTINGS.cursorBlink,
        themeName:
            typeof raw?.themeName === "string" && raw.themeName.trim()
                ? raw.themeName
                : fallbackTheme,
        autoSyncEnabled:
            typeof raw?.autoSyncEnabled === "boolean"
                ? raw.autoSyncEnabled
                : DEFAULT_SETTINGS.autoSyncEnabled,
        hideSensitive:
            typeof raw?.hideSensitive === "boolean"
                ? raw.hideSensitive
                : DEFAULT_SETTINGS.hideSensitive,
        preferredNode:
            typeof raw?.preferredNode === "string"
                ? raw.preferredNode
                : DEFAULT_SETTINGS.preferredNode,
    } satisfies AppSettings
}

function readStoredSettings(): AppSettings {
    if (!import.meta.client) return { ...DEFAULT_SETTINGS }

    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
            return normalizeSettings(JSON.parse(raw) as Partial<AppSettings>)
        }
    } catch {}

    return normalizeSettings(null)
}

function applyAnimationCssVars(current: AppSettings): void {
    if (!import.meta.client) return
    const root = document.documentElement
    if (!current.animationsEnabled) {
        root.style.setProperty("--transition-duration", "0s")
    } else {
        root.style.setProperty(
            "--transition-duration",
            ANIMATION_SPEED_DURATION[current.animationSpeed]
        )
    }
}

function applyTerminalCssVars(current: AppSettings): void {
    if (!import.meta.client) return
    const root = document.documentElement
    root.style.setProperty("--terminal-font-size", `${current.fontSize}px`)
    root.style.setProperty(
        "--terminal-letter-spacing",
        `${current.letterSpacing}px`
    )
}

const settings = ref<AppSettings>(readStoredSettings())

const animationDuration = computed(() =>
    settings.value.animationsEnabled
        ? ANIMATION_SPEED_DURATION[settings.value.animationSpeed]
        : "0s"
)

if (import.meta.client) {
    applyAnimationCssVars(settings.value)
}

if (import.meta.client) {
    applyTerminalCssVars(settings.value)
}

watch(
    settings,
    (updated) => {
        if (!import.meta.client) return
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        localStorage.setItem(LEGACY_THEME_KEY, updated.themeName)
        applyAnimationCssVars(updated)
        applyTerminalCssVars(updated)
    },
    { deep: true }
)

const replaceSettings = (incoming: Partial<AppSettings>) => {
    settings.value = normalizeSettings(incoming)
}

const clearStoredSettings = () => {
    if (import.meta.client) {
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(LEGACY_THEME_KEY)
    }

    settings.value = { ...DEFAULT_SETTINGS }
}

export const useSettings = () => {
    return {
        settings,
        animationDuration,
        ANIMATION_SPEED_LABELS,
        ANIMATION_SPEED_DURATION,
        DEFAULT_SETTINGS,
        replaceSettings,
        clearStoredSettings,
    }
}

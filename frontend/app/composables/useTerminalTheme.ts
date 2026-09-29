import { computed } from "vue"
import { useSettings } from "~/composables/useSettings"

export interface TerminalTheme {
    name: string
    background: string
    foreground: string
    cursor: string
    selectionBackground: string
    black: string
    brightBlack: string
    red: string
    brightRed: string
    green: string
    brightGreen: string
    yellow: string
    brightYellow: string
    blue: string
    brightBlue: string
    magenta: string
    brightMagenta: string
    cyan: string
    brightCyan: string
    white: string
    brightWhite: string
}

export const themes: TerminalTheme[] = [
    {
        name: "Dracula",
        background: "#282a36",
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
    {
        name: "One Dark",
        background: "#282c34",
        foreground: "#abb2bf",
        cursor: "#528bff",
        selectionBackground: "#3e4451",
        black: "#282c34",
        brightBlack: "#5c6370",
        red: "#e06c75",
        brightRed: "#e06c75",
        green: "#98c379",
        brightGreen: "#98c379",
        yellow: "#d19a66",
        brightYellow: "#d19a66",
        blue: "#61afef",
        brightBlue: "#61afef",
        magenta: "#c678dd",
        brightMagenta: "#c678dd",
        cyan: "#56b6c2",
        brightCyan: "#56b6c2",
        white: "#abb2bf",
        brightWhite: "#ffffff",
    },
    {
        name: "Solarized Dark",
        background: "#002b36",
        foreground: "#839496",
        cursor: "#93a1a1",
        selectionBackground: "#073642",
        black: "#073642",
        brightBlack: "#002b36",
        red: "#dc322f",
        brightRed: "#cb4b16",
        green: "#859900",
        brightGreen: "#586e75",
        yellow: "#b58900",
        brightYellow: "#657b83",
        blue: "#268bd2",
        brightBlue: "#839496",
        magenta: "#d33682",
        brightMagenta: "#6c71c4",
        cyan: "#2aa198",
        brightCyan: "#93a1a1",
        white: "#eee8d5",
        brightWhite: "#fdf6e3",
    },
    {
        name: "Monokai",
        background: "#272822",
        foreground: "#f8f8f2",
        cursor: "#f8f8f2",
        selectionBackground: "#49483e",
        black: "#272822",
        brightBlack: "#75715e",
        red: "#f92672",
        brightRed: "#f92672",
        green: "#a6e22e",
        brightGreen: "#a6e22e",
        yellow: "#e6db74",
        brightYellow: "#e6db74",
        blue: "#66d9ef",
        brightBlue: "#66d9ef",
        magenta: "#ae81ff",
        brightMagenta: "#ae81ff",
        cyan: "#a1efe4",
        brightCyan: "#a1efe4",
        white: "#f8f8f2",
        brightWhite: "#ffffff",
    },
]

const { settings, DEFAULT_SETTINGS } = useSettings()

const currentThemeName = computed({
    get: () => settings.value.themeName,
    set: (name: string) => {
        settings.value.themeName =
            themes.find((theme) => theme.name === name)?.name ??
            DEFAULT_SETTINGS.themeName
    },
})

const currentTheme = computed(
    () =>
        themes.find((theme) => theme.name === currentThemeName.value) ||
        themes[0]
)

export const useTerminalTheme = () => {
    return {
        currentThemeName,
        currentTheme,
        themes,
    }
}

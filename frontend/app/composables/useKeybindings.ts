import { ref, watch } from "vue"

export interface Keybinding {
    id: string
    label: string
    keys: string
    action: string
}

export const defaultKeybindings: Keybinding[] = [
    {
        id: "split-right",
        label: "Split Right",
        keys: "Ctrl+\\",
        action: "split-right",
    },
    {
        id: "split-down",
        label: "Split Down",
        keys: "Ctrl+-",
        action: "split-down",
    },
    {
        id: "unsplit",
        label: "Unsplit / Single View",
        keys: "Ctrl+Shift+E",
        action: "unsplit",
    },
    {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        keys: "Ctrl+B",
        action: "toggle-sidebar",
    },
    {
        id: "cycle-tabs",
        label: "Cycle Tabs",
        keys: "Ctrl+Tab",
        action: "cycle-tabs",
    },
    {
        id: "close-tab",
        label: "Close Active Tab",
        keys: "Ctrl+W",
        action: "close-tab",
    },
]

export const useKeybindings = () => {
    const keybindings = ref<Keybinding[]>(
        import.meta.client
            ? JSON.parse(
                  localStorage.getItem("websh-keybindings") ||
                      JSON.stringify(defaultKeybindings)
              )
            : defaultKeybindings
    )

    watch(
        keybindings,
        (newKeybindings) => {
            if (import.meta.client) {
                localStorage.setItem(
                    "websh-keybindings",
                    JSON.stringify(newKeybindings)
                )
            }
        },
        { deep: true }
    )

    const resetKeybindings = () => {
        keybindings.value = JSON.parse(JSON.stringify(defaultKeybindings))
    }

    return {
        keybindings,
        resetKeybindings,
    }
}

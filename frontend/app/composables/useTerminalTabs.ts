import { ref, computed, shallowRef, type Ref } from "vue"
import { type ServerRecord } from "~/lib/db"
import { useSshSession } from "./useSshSession"
import { type Terminal } from "@xterm/xterm"

export interface TerminalTab {
    id: string
    serverId: number
    serverName: string
    session: ReturnType<typeof useSshSession>
    terminal: Ref<Terminal | null>
}

export interface Pane {
    paneId: string
    tabId: string | null
}

export type TileLayout = "single" | "split-h" | "split-v" | "2x2"

export const useTerminalTabs = (masterPassword: Ref<string>) => {
    const tabs = shallowRef<TerminalTab[]>([])
    const layout = ref<TileLayout>("single")
    const panes = ref<Pane[]>([{ paneId: "p0", tabId: null }])
    const focusedPaneId = ref<string>("p0")

    const activeTabId = computed({
        get: () =>
            panes.value.find((p) => p.paneId === focusedPaneId.value)?.tabId ??
            null,
        set: (tabId: string | null) => {
            setTabInPane(focusedPaneId.value, tabId)
        },
    })

    const activeTab = computed(
        () => tabs.value.find((t) => t.id === activeTabId.value) || null
    )

    function setTabInPane(paneId: string, tabId: string | null) {
        panes.value = panes.value.map((p) =>
            p.paneId === paneId ? { ...p, tabId } : p
        )
    }

    function splitH() {
        const currentTabId =
            panes.value.find((p) => p.paneId === focusedPaneId.value)?.tabId ??
            null
        const usedIds = panes.value.map((p) => p.tabId).filter(Boolean)
        const otherTab = tabs.value.find((t) => !usedIds.includes(t.id))
        layout.value = "split-h"
        panes.value = [
            { paneId: "p0", tabId: currentTabId },
            { paneId: "p1", tabId: otherTab?.id ?? null },
        ]
        focusedPaneId.value = "p0"
    }

    function splitV() {
        const currentTabId =
            panes.value.find((p) => p.paneId === focusedPaneId.value)?.tabId ??
            null
        const usedIds = panes.value.map((p) => p.tabId).filter(Boolean)
        const otherTab = tabs.value.find((t) => !usedIds.includes(t.id))
        layout.value = "split-v"
        panes.value = [
            { paneId: "p0", tabId: currentTabId },
            { paneId: "p1", tabId: otherTab?.id ?? null },
        ]
        focusedPaneId.value = "p0"
    }

    function splitGrid() {
        layout.value = "2x2"
        const newPanes: Pane[] = []
        const used: (string | null)[] = panes.value.map((p) => p.tabId)
        for (let i = 0; i < 4; i++) {
            if (i < panes.value.length) {
                newPanes.push({
                    paneId: `p${i}`,
                    tabId: panes.value[i]!.tabId,
                })
            } else {
                const next = tabs.value.find((t) => !used.includes(t.id))
                const tabId = next?.id ?? null
                used.push(tabId)
                newPanes.push({ paneId: `p${i}`, tabId })
            }
        }
        panes.value = newPanes
    }

    function unsplit() {
        const fp = panes.value.find((p) => p.paneId === focusedPaneId.value)
        layout.value = "single"
        panes.value = [
            {
                paneId: "p0",
                tabId: fp?.tabId ?? panes.value[0]?.tabId ?? null,
            },
        ]
        focusedPaneId.value = "p0"
    }

    const addTab = async (server: ServerRecord) => {
        const id = Math.random().toString(36).substring(7)
        const terminal = ref<Terminal | null>(null)
        const session = useSshSession(masterPassword, terminal, () =>
            removeTab(id)
        )

        const newTab: TerminalTab = {
            id,
            serverId: server.id!,
            serverName: server.name,
            session,
            terminal,
        }

        tabs.value = [...tabs.value, newTab]
        setTabInPane(focusedPaneId.value, id)

        await session.connectToServer(server)
    }

    const removeTab = (id: string) => {
        const index = tabs.value.findIndex((t) => t.id === id)
        if (index !== -1) {
            const tab = tabs.value[index]
            tab?.session.disconnect()
            const newTabs = [...tabs.value]
            newTabs.splice(index, 1)
            tabs.value = newTabs
            panes.value = panes.value.map((p) => {
                if (p.tabId !== id) return p
                const fallback = newTabs.find(
                    (t) =>
                        !panes.value.some(
                            (pp) => pp.tabId === t.id && pp.paneId !== p.paneId
                        )
                )
                return { ...p, tabId: fallback?.id ?? null }
            })
        }
    }

    const closeAllTabs = () => {
        tabs.value.forEach((tab) => tab.session.disconnect())
        tabs.value = []
        layout.value = "single"
        panes.value = [{ paneId: "p0", tabId: null }]
        focusedPaneId.value = "p0"
    }

    return {
        tabs,
        activeTabId,
        activeTab,
        addTab,
        removeTab,
        closeAllTabs,
        layout,
        panes,
        focusedPaneId,
        setTabInPane,
        splitH,
        splitV,
        splitGrid,
        unsplit,
    }
}

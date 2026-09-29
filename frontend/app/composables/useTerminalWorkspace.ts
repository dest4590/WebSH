import type { FitAddon } from "@xterm/addon-fit"
import type { SearchAddon } from "@xterm/addon-search"
import type { Terminal, IDisposable } from "@xterm/xterm"
import { computed, markRaw, ref, shallowReactive, type Ref, watch } from "vue"
import { type ServerRecord } from "~/lib/db"
import { useSshSession } from "./useSshSession"
import { useTerminalTheme } from "./useTerminalTheme"
import { useSettings } from "~/composables/useSettings"

export const SETTINGS_PANE_ID = "__settings__"
export const SNIPPETS_PANE_ID = "__snippets__"
export const FILE_MANAGER_PANE_ID = "__file_manager__"
export const FILE_MANAGER_PANE_PREFIX = `${FILE_MANAGER_PANE_ID}:`

export const SPECIAL_PANE_IDS = [SETTINGS_PANE_ID, SNIPPETS_PANE_ID] as const

export const isFileManagerPaneId = (id: string): boolean =>
    id.startsWith(FILE_MANAGER_PANE_PREFIX)

export const isSpecialPane = (id: string): boolean =>
    (SPECIAL_PANE_IDS as readonly string[]).includes(id) ||
    isFileManagerPaneId(id)

export const createFileManagerPaneId = () =>
    `${FILE_MANAGER_PANE_PREFIX}${makeId("pane")}`

export type SplitDirection = "horizontal" | "vertical"
export type FocusDirection = "left" | "right" | "up" | "down"

export type LayoutNode = {
    id: string
    type: "leaf" | "split"
    direction?: SplitDirection
    splitPercentage?: number
    children?: [LayoutNode, LayoutNode]
    terminalId?: string
}

export interface TerminalSession {
    id: string
    label: string
    serverId: number | null
    serverName: string
    hasConnectionHistory: boolean
    hostElement: HTMLDivElement
    terminal: Terminal
    fitAddon: FitAddon
    searchAddon: SearchAddon
    terminalRef: Ref<Terminal | null>
    ssh: ReturnType<typeof useSshSession>
    dataSubscription: IDisposable
    resizeSubscription: IDisposable
}

type NormalizedRect = {
    terminalId: string
    x: number
    y: number
    width: number
    height: number
}

let workspaceStore: ReturnType<typeof createTerminalWorkspace> | null = null

const clampSplit = (value: number) => Math.min(0.85, Math.max(0.15, value))

const makeId = (prefix: string) => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return `${prefix}-${crypto.randomUUID()}`
    }

    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

const createLeafNode = (terminalId: string): LayoutNode => ({
    id: makeId("leaf"),
    type: "leaf",
    terminalId,
})

const collectLeafTerminalIds = (
    node: LayoutNode | null,
    terminalIds: string[] = []
) => {
    if (!node) {
        return terminalIds
    }

    if (node.type === "leaf") {
        if (node.terminalId) {
            terminalIds.push(node.terminalId)
        }
        return terminalIds
    }

    collectLeafTerminalIds(node.children?.[0] ?? null, terminalIds)
    collectLeafTerminalIds(node.children?.[1] ?? null, terminalIds)
    return terminalIds
}

const findFirstLeafTerminalId = (node: LayoutNode | null): string | null => {
    if (!node) {
        return null
    }

    if (node.type === "leaf") {
        return node.terminalId ?? null
    }

    return (
        findFirstLeafTerminalId(node.children?.[0] ?? null) ??
        findFirstLeafTerminalId(node.children?.[1] ?? null)
    )
}

const replaceLeafNode = (
    node: LayoutNode,
    terminalId: string,
    replace: (leaf: LayoutNode) => LayoutNode
): LayoutNode => {
    if (node.type === "leaf") {
        return node.terminalId === terminalId ? replace(node) : node
    }

    const firstChild = node.children?.[0]
    const secondChild = node.children?.[1]
    if (!firstChild || !secondChild) {
        return node
    }

    const nextFirst = replaceLeafNode(firstChild, terminalId, replace)
    const nextSecond = replaceLeafNode(secondChild, terminalId, replace)
    if (nextFirst === firstChild && nextSecond === secondChild) {
        return node
    }

    return {
        ...node,
        children: [nextFirst, nextSecond],
    }
}

const removeLeafNode = (
    node: LayoutNode,
    terminalId: string
): LayoutNode | null => {
    if (node.type === "leaf") {
        return node.terminalId === terminalId ? null : node
    }

    const firstChild = node.children?.[0]
    const secondChild = node.children?.[1]
    if (!firstChild || !secondChild) {
        return node
    }

    const nextFirst = removeLeafNode(firstChild, terminalId)
    const nextSecond = removeLeafNode(secondChild, terminalId)

    if (!nextFirst && !nextSecond) {
        return null
    }

    if (!nextFirst) {
        return nextSecond
    }

    if (!nextSecond) {
        return nextFirst
    }

    if (nextFirst === firstChild && nextSecond === secondChild) {
        return node
    }

    return {
        ...node,
        children: [nextFirst, nextSecond],
    }
}

const updateSplitNode = (
    node: LayoutNode,
    nodeId: string,
    splitPercentage: number
): LayoutNode => {
    if (node.type === "split" && node.id === nodeId) {
        return {
            ...node,
            splitPercentage: clampSplit(splitPercentage),
        }
    }

    if (node.type === "leaf") {
        return node
    }

    const firstChild = node.children?.[0]
    const secondChild = node.children?.[1]
    if (!firstChild || !secondChild) {
        return node
    }

    const nextFirst = updateSplitNode(firstChild, nodeId, splitPercentage)
    const nextSecond = updateSplitNode(secondChild, nodeId, splitPercentage)
    if (nextFirst === firstChild && nextSecond === secondChild) {
        return node
    }

    return {
        ...node,
        children: [nextFirst, nextSecond],
    }
}

const collectLeafRects = (
    node: LayoutNode | null,
    rect: Omit<NormalizedRect, "terminalId">,
    result: NormalizedRect[] = []
) => {
    if (!node) {
        return result
    }

    if (node.type === "leaf") {
        if (node.terminalId) {
            result.push({
                terminalId: node.terminalId,
                ...rect,
            })
        }
        return result
    }

    const splitPercentage = clampSplit(node.splitPercentage ?? 0.5)
    const [firstChild, secondChild] = node.children ?? []
    if (!firstChild || !secondChild) {
        return result
    }

    if (node.direction === "vertical") {
        const firstWidth = rect.width * splitPercentage
        collectLeafRects(
            firstChild,
            {
                x: rect.x,
                y: rect.y,
                width: firstWidth,
                height: rect.height,
            },
            result
        )
        collectLeafRects(
            secondChild,
            {
                x: rect.x + firstWidth,
                y: rect.y,
                width: rect.width - firstWidth,
                height: rect.height,
            },
            result
        )
        return result
    }

    const firstHeight = rect.height * splitPercentage
    collectLeafRects(
        firstChild,
        {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: firstHeight,
        },
        result
    )
    collectLeafRects(
        secondChild,
        {
            x: rect.x,
            y: rect.y + firstHeight,
            width: rect.width,
            height: rect.height - firstHeight,
        },
        result
    )

    return result
}

const overlapAmount = (
    startA: number,
    endA: number,
    startB: number,
    endB: number
) => Math.max(0, Math.min(endA, endB) - Math.max(startA, startB))

function createTerminalWorkspace(masterPassword: Ref<string>) {
    const sessions = shallowReactive(new Map<string, TerminalSession>())
    const layoutRoot = ref<LayoutNode | null>(null)
    const focusedTerminalId = ref<string | null>(null)
    const initialized = ref(false)
    const draggingTerminalId = ref<string | null>(null)
    const tabOrder = ref<string[]>([])
    const { currentTheme } = useTerminalTheme()

    const { settings } = useSettings()

    watch(
        settings,
        (s) => {
            for (const session of sessions.values()) {
                try {
                    session.terminal.options = {
                        ...session.terminal.options,
                        fontSize: s.fontSize,
                        fontFamily: s.fontFamily,
                        letterSpacing: s.letterSpacing,
                        cursorBlink: s.cursorBlink,
                    }
                    session.terminal.refresh(0, session.terminal.rows - 1)
                    session.fitAddon.fit()
                    window.setTimeout(() => session.fitAddon.fit(), 50)
                } catch (e) {
                    try {
                        session.terminal.options.fontSize = s.fontSize
                        session.terminal.options.fontFamily = s.fontFamily
                        session.terminal.options.letterSpacing = s.letterSpacing
                        session.terminal.options.cursorBlink = s.cursorBlink
                        session.terminal.refresh(0, session.terminal.rows - 1)
                        session.fitAddon.fit()
                        window.setTimeout(() => session.fitAddon.fit(), 50)
                    } catch (err) {
                        console.warn(
                            "applySettings: failed to update session",
                            err
                        )
                    }
                }
            }
        },
        { deep: true }
    )

    watch(currentTheme, (theme) => {
        for (const session of sessions.values()) {
            try {
                const nextTheme = { ...theme }
                session.terminal.options = {
                    ...session.terminal.options,
                    theme: nextTheme,
                }
                session.terminal.refresh(0, session.terminal.rows - 1)
            } catch (e) {
                session.terminal.options.theme = { ...theme }
                session.terminal.refresh(0, session.terminal.rows - 1)
            }
        }
    })

    let terminalNumber = 1

    const orderedTerminalIds = computed(() => tabOrder.value)

    const orderedSessions = computed(
        () =>
            tabOrder.value
                .map((id) => sessions.get(id))
                .filter(Boolean) as TerminalSession[]
    )

    const layoutLeafIds = computed(() =>
        collectLeafTerminalIds(layoutRoot.value)
    )

    const activeSession = computed(() => {
        if (!focusedTerminalId.value) {
            return null
        }

        return sessions.get(focusedTerminalId.value) ?? null
    })

    const hasMultiplePanes = computed(() => layoutLeafIds.value.length > 1)

    const makeSessionLabel = () => `Terminal ${terminalNumber++}`

    const focusTerminal = (terminalId: string) => {
        const session = sessions.get(terminalId)
        if (!session && !isSpecialPane(terminalId)) {
            return
        }

        focusedTerminalId.value = terminalId
        if (session) {
            session.terminal.focus()
        }
    }

    const fitSession = (terminalId: string) => {
        const session = sessions.get(terminalId)
        if (!session || !import.meta.client) {
            return
        }

        window.requestAnimationFrame(() => {
            session.fitAddon.fit()
        })
    }

    const attachSession = (terminalId: string, container: HTMLElement) => {
        const session = sessions.get(terminalId)
        if (!session) {
            return
        }

        if (session.hostElement.parentElement !== container) {
            container.replaceChildren(session.hostElement)
            try {
                ;(session.hostElement as HTMLDivElement).style.fontFamily =
                    "JetBrains Mono, IBM Plex Mono, Fira Code, Cascadia Code, ui-monospace, monospace"
            } catch (e) {
                console.log(
                    "attachSession: set hostElement.fontFamily error",
                    e
                )
            }
        }

        fitSession(terminalId)
    }

    const detachSession = (terminalId: string, container: HTMLElement) => {
        const session = sessions.get(terminalId)
        if (!session) {
            return
        }

        if (session.hostElement.parentElement === container) {
            container.replaceChildren()
        }
    }

    const createSession = async () => {
        const id = makeId("terminal")
        const hostElement = markRaw(document.createElement("div"))
        hostElement.className = "websh-terminal-host"
        try {
            ;(hostElement as HTMLDivElement).style.fontFamily =
                "JetBrains Mono, IBM Plex Mono, Fira Code, Cascadia Code, ui-monospace, monospace"
        } catch (e) {
            console.log("createSession: set hostElement.fontFamily error", e)
        }

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

        const { settings } = useSettings()

        const preferredFont =
            settings.value?.fontFamily ??
            "'JetBrains Mono Nerd', 'JetBrains Mono', IBM Plex Mono, Fira Code, Cascadia Code, ui-monospace, monospace"

        const terminal = markRaw(
            new Terminal({
                convertEol: true,
                cursorBlink: settings.value?.cursorBlink ?? true,
                cursorInactiveStyle: "bar",
                fontFamily: preferredFont,
                fontSize: settings.value?.fontSize ?? 15,
                letterSpacing: settings.value?.letterSpacing ?? 0.25,
                scrollback: 5000,
                theme: { ...currentTheme.value },
                allowProposedApi: true,
            })
        )
        const fitAddon = markRaw(new FitAddon())
        const searchAddon = markRaw(new SearchAddon())
        const webLinksAddon = markRaw(new WebLinksAddon())
        const unicode11Addon = markRaw(new Unicode11Addon())

        const terminalRef = ref<Terminal | null>(terminal)
        const ssh = useSshSession(masterPassword, terminalRef)

        terminal.loadAddon(fitAddon)
        terminal.loadAddon(searchAddon)
        terminal.loadAddon(webLinksAddon)
        terminal.loadAddon(unicode11Addon)
        terminal.unicode.activeVersion = "11"

        try {
            const webFontsMod = await import("@xterm/addon-web-fonts")

            if (typeof webFontsMod.loadFonts === "function") {
                try {
                    await webFontsMod.loadFonts(["JetBrains Mono"])
                } catch (e) {
                    console.log("createSession: web-fonts.loadFonts error", e)
                }
            } else if (webFontsMod.WebFontsAddon) {
                try {
                    const webFontsInstance = new webFontsMod.WebFontsAddon()
                    terminal.loadAddon(webFontsInstance)
                    await webFontsInstance.loadFonts(["JetBrains Mono"])
                } catch (e) {
                    console.log("createSession: WebFontsAddon error", e)
                }
            }
        } catch (e) {
            console.log(
                "createSession: @xterm/addon-web-fonts not available",
                e
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
        } catch (err) {
            console.log("createSession: font API error", err)
        }

        terminal.open(hostElement)

        const session: TerminalSession = {
            id,
            label: makeSessionLabel(),
            serverId: null,
            serverName: "",
            hasConnectionHistory: false,
            hostElement,
            terminal,
            fitAddon,
            searchAddon,
            terminalRef,
            ssh,
            dataSubscription: markRaw(
                terminal.onData(async (input) => {
                    if (ssh.connectionState.value === "connected") {
                        await ssh.sendInput(input)
                        return
                    }

                    if (!input.includes("\r") && !input.includes("\n")) {
                        terminal.write(input)
                    }
                })
            ),
            resizeSubscription: markRaw(
                terminal.onResize(({ cols, rows }) => {
                    void ssh.resizeTerminal(cols, rows)
                })
            ),
        }

        sessions.set(id, session)
        return session
    }

    const disposeSession = (terminalId: string) => {
        const session = sessions.get(terminalId)
        if (!session) {
            return
        }

        session.dataSubscription.dispose()
        session.resizeSubscription.dispose()
        session.ssh.disconnect()
        session.terminalRef.value = null
        session.terminal.dispose()
        sessions.delete(terminalId)
    }

    const ensureInitialized = () => {
        if (!import.meta.client || initialized.value) {
            return
        }

        initialized.value = true
    }

    const connectSessionToServer = async (
        terminalId: string | null,
        server: ServerRecord
    ) => {
        ensureInitialized()

        let targetId = terminalId

        if (!targetId || !sessions.has(targetId)) {
            const newSession = await createSession()
            tabOrder.value = [...tabOrder.value, newSession.id]
            layoutRoot.value = createLeafNode(newSession.id)
            targetId = newSession.id
        }

        const session = sessions.get(targetId!)
        if (!session) {
            return
        }

        session.serverId = server.id ?? null
        session.serverName = server.name
        session.hasConnectionHistory = true
        focusTerminal(targetId!)
        await session.ssh.connectToServer(server)
        fitSession(targetId!)
    }

    /**
     * Switch the visible view to a tab.
     * - If the tab is already in the current BSP view, just focus it.
     * - Otherwise replace the view with just that tab (full-screen).
     */
    const setActiveTab = (tabId: string) => {
        ensureInitialized()
        if (layoutLeafIds.value.includes(tabId)) {
            focusTerminal(tabId)
        } else {
            layoutRoot.value = createLeafNode(tabId)
            focusTerminal(tabId)
            fitSession(tabId)
        }
    }

    /**
     * Reorder tabs in the tab bar by dragging one tab before/after another.
     */
    const reorderTab = (
        draggedId: string,
        targetId: string,
        insertBefore: boolean
    ) => {
        const newOrder = tabOrder.value.filter((id) => id !== draggedId)
        const idx = newOrder.indexOf(targetId)
        if (idx === -1) return
        newOrder.splice(insertBefore ? idx : idx + 1, 0, draggedId)
        tabOrder.value = newOrder
    }

    /**
     * Place a session (from a tab drag) into the BSP view next to a target pane.
     * The source may be a standalone tab (not currently in the view) or an
     * already-visible pane being rearranged within the view.
     */
    const placeSession = (
        sourceId: string,
        targetId: string,
        side: "left" | "right" | "top" | "bottom"
    ) => {
        if (!layoutRoot.value || sourceId === targetId) return

        const sourceInView = layoutLeafIds.value.includes(sourceId)
        if (sourceInView) {
            const nextRoot = removeLeafNode(layoutRoot.value, sourceId)
            if (!nextRoot) return
            layoutRoot.value = nextRoot
        }

        const direction: SplitDirection =
            side === "left" || side === "right" ? "vertical" : "horizontal"
        const sourceFirst = side === "left" || side === "top"

        layoutRoot.value = replaceLeafNode(
            layoutRoot.value,
            targetId,
            (leaf) => ({
                id: makeId("split"),
                type: "split",
                direction,
                splitPercentage: 0.5,
                children: sourceFirst
                    ? [
                          createLeafNode(sourceId),
                          { ...leaf, id: makeId("leaf") },
                      ]
                    : [
                          { ...leaf, id: makeId("leaf") },
                          createLeafNode(sourceId),
                      ],
            })
        )

        focusTerminal(sourceId)
        fitSession(sourceId)
    }

    /**
     * Detach a terminal from the BSP layout and make it the active standalone tab.
     * Other panes remain available as tabs in the tab bar.
     */
    const detachPane = (terminalId: string) => {
        ensureInitialized()
        if (!sessions.has(terminalId) && !isSpecialPane(terminalId)) return

        if (layoutRoot.value) {
            const nextRoot = removeLeafNode(layoutRoot.value, terminalId)
            layoutRoot.value = nextRoot ?? null
        }

        if (!tabOrder.value.includes(terminalId)) {
            tabOrder.value = [...tabOrder.value, terminalId]
        }

        setActiveTab(terminalId)
    }

    const splitTerminal = async (
        terminalId: string,
        direction: SplitDirection
    ) => {
        ensureInitialized()

        if (
            !layoutRoot.value ||
            (!sessions.has(terminalId) && !isSpecialPane(terminalId))
        ) {
            return null
        }

        const newSession = await createSession()
        tabOrder.value = [...tabOrder.value, newSession.id]
        layoutRoot.value = replaceLeafNode(
            layoutRoot.value,
            terminalId,
            (leaf) => ({
                id: makeId("split"),
                type: "split",
                direction,
                splitPercentage: 0.5,
                children: [
                    {
                        ...leaf,
                        id: makeId("leaf"),
                    },
                    createLeafNode(newSession.id),
                ],
            })
        )
        focusTerminal(newSession.id)
        return newSession.id
    }

    const splitVertical = (terminalId: string) =>
        splitTerminal(terminalId, "vertical")

    const splitHorizontal = (terminalId: string) =>
        splitTerminal(terminalId, "horizontal")

    const closePane = (terminalId: string) => {
        ensureInitialized()

        const isSpecialPaneId = isSpecialPane(terminalId)
        const hasSession = sessions.has(terminalId)
        if (!hasSession && !isSpecialPaneId) return

        if (hasSession) {
            tabOrder.value = tabOrder.value.filter((id) => id !== terminalId)
        }

        const isInView = layoutLeafIds.value.includes(terminalId)
        if (isInView && layoutRoot.value) {
            const nextRoot = removeLeafNode(layoutRoot.value, terminalId)

            if (!nextRoot) {
                const nextTabId = tabOrder.value[0] ?? null
                if (nextTabId) {
                    layoutRoot.value = createLeafNode(nextTabId)
                    if (hasSession) disposeSession(terminalId)
                    focusTerminal(nextTabId)
                    fitSession(nextTabId)
                } else {
                    layoutRoot.value = null
                    focusedTerminalId.value = null
                    if (hasSession) disposeSession(terminalId)
                    initialized.value = false
                    ensureInitialized()
                }
                return
            }

            layoutRoot.value = nextRoot
            if (focusedTerminalId.value === terminalId) {
                const nextId = findFirstLeafTerminalId(nextRoot)
                if (nextId) focusTerminal(nextId)
            }
        }

        if (hasSession) {
            disposeSession(terminalId)
        }
    }

    const closeAllPanes = () => {
        for (const terminalId of Array.from(sessions.keys())) {
            disposeSession(terminalId)
        }

        initialized.value = false
        layoutRoot.value = null
        focusedTerminalId.value = null
        tabOrder.value = []
        ensureInitialized()
    }

    /**
     * "Maximize" the given terminal - collapse any splits so only this pane
     * fills the view. Other sessions remain as accessible tabs.
     */
    const resetToTerminal = (terminalId: string) => {
        ensureInitialized()
        if (!sessions.has(terminalId)) return
        layoutRoot.value = createLeafNode(terminalId)
        focusTerminal(terminalId)
        fitSession(terminalId)
    }

    const updateSplitPercentage = (nodeId: string, splitPercentage: number) => {
        if (!layoutRoot.value) {
            return
        }

        layoutRoot.value = updateSplitNode(
            layoutRoot.value,
            nodeId,
            splitPercentage
        )
    }

    const moveFocus = (direction: FocusDirection) => {
        if (!layoutRoot.value || !focusedTerminalId.value) {
            return
        }

        const rects = collectLeafRects(
            layoutRoot.value,
            { x: 0, y: 0, width: 1, height: 1 },
            []
        )
        const currentRect = rects.find(
            (rect) => rect.terminalId === focusedTerminalId.value
        )
        if (!currentRect) {
            return
        }

        let bestMatch: { terminalId: string; score: number } | null = null

        for (const candidate of rects) {
            if (candidate.terminalId === currentRect.terminalId) {
                continue
            }

            const axisOverlap =
                direction === "left" || direction === "right"
                    ? overlapAmount(
                          currentRect.y,
                          currentRect.y + currentRect.height,
                          candidate.y,
                          candidate.y + candidate.height
                      )
                    : overlapAmount(
                          currentRect.x,
                          currentRect.x + currentRect.width,
                          candidate.x,
                          candidate.x + candidate.width
                      )

            const primaryDistance =
                direction === "left"
                    ? currentRect.x - (candidate.x + candidate.width)
                    : direction === "right"
                      ? candidate.x - (currentRect.x + currentRect.width)
                      : direction === "up"
                        ? currentRect.y - (candidate.y + candidate.height)
                        : candidate.y - (currentRect.y + currentRect.height)

            if (primaryDistance < -0.0001) {
                continue
            }

            const secondaryDistance =
                direction === "left" || direction === "right"
                    ? Math.abs(
                          candidate.y +
                              candidate.height / 2 -
                              (currentRect.y + currentRect.height / 2)
                      )
                    : Math.abs(
                          candidate.x +
                              candidate.width / 2 -
                              (currentRect.x + currentRect.width / 2)
                      )

            const score =
                primaryDistance * 10 +
                secondaryDistance * 3 +
                (axisOverlap > 0 ? 0 : 100)

            if (!bestMatch || score < bestMatch.score) {
                bestMatch = {
                    terminalId: candidate.terminalId,
                    score,
                }
            }
        }

        if (bestMatch) {
            focusTerminal(bestMatch.terminalId)
        }
    }

    if (import.meta.client) {
        ensureInitialized()
    }

    return {
        sessions,
        layoutRoot,
        layoutLeafIds,
        focusedTerminalId,
        orderedTerminalIds,
        orderedSessions,
        activeSession,
        hasMultiplePanes,
        draggingTerminalId,
        ensureInitialized,
        focusTerminal,
        fitSession,
        attachSession,
        detachSession,
        connectSessionToServer,
        setActiveTab,
        reorderTab,
        placeSession,
        detachPane,
        splitVertical,
        splitHorizontal,
        closePane,
        closeAllPanes,
        resetToTerminal,
        updateSplitPercentage,
        moveFocus,
    }
}

export type TerminalWorkspace = ReturnType<typeof createTerminalWorkspace>

const createTerminalWorkspaceStub = (): TerminalWorkspace => {
    const sessions = shallowReactive(new Map<string, TerminalSession>())
    const tabOrder = ref<string[]>([])
    const layoutRoot = ref<LayoutNode | null>(null)
    const focusedTerminalId = ref<string | null>(null)
    const draggingTerminalId = ref<string | null>(null)

    const orderedTerminalIds = computed(() => tabOrder.value)
    const orderedSessions = computed<TerminalSession[]>(() => [])
    const layoutLeafIds = computed<string[]>(() => [])
    const activeSession = computed<TerminalSession | null>(() => null)
    const hasMultiplePanes = computed(() => false)

    const noop = (): void => {}
    const noopPromise = async (): Promise<void> => {}
    const noopSplit = async (_terminalId: string): Promise<string | null> =>
        null
    const noopMoveFocus = (_direction: FocusDirection): void => {}

    return {
        sessions,
        layoutRoot,
        layoutLeafIds,
        focusedTerminalId,
        orderedTerminalIds,
        orderedSessions,
        activeSession,
        hasMultiplePanes,
        draggingTerminalId,
        ensureInitialized: noop,
        focusTerminal: noop,
        fitSession: noop,
        attachSession: noop,
        detachSession: noop,
        connectSessionToServer: noopPromise,
        setActiveTab: noop,
        reorderTab: noop,
        placeSession: noop,
        detachPane: noop,
        splitVertical: noopSplit,
        splitHorizontal: noopSplit,
        closePane: noop,
        closeAllPanes: noop,
        resetToTerminal: noop,
        updateSplitPercentage: noop,
        moveFocus: noopMoveFocus,
    }
}

export const useTerminalWorkspace = (masterPassword?: Ref<string>) => {
    if (import.meta.server) {
        if (!workspaceStore) {
            if (masterPassword) {
                workspaceStore = createTerminalWorkspace(masterPassword)
            } else {
                return createTerminalWorkspaceStub()
            }
        }

        return workspaceStore
    }

    if (!workspaceStore) {
        if (!masterPassword) {
            throw new Error(
                "Terminal workspace store has not been initialized."
            )
        }

        workspaceStore = createTerminalWorkspace(masterPassword)
    }

    return workspaceStore
}

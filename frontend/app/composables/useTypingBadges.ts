import { onBeforeUnmount, ref, type CSSProperties } from "vue"

export interface TypingBadge {
    from: string
    x: number
    y: number
    visible: boolean
    timer: ReturnType<typeof setTimeout> | null
    id: string
}

export interface UseTypingBadgesOptions {
    getCursorPos: () => { x: number; y: number } | null
    isSuppressed?: () => boolean
    visibleDurationMs?: number
}

export const typingBadgeBaseStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "3px 8px",
    border: "1px solid rgba(255, 255, 255, 0.9)",
    borderRadius: "2px",
    background: "#000000",
    boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.9)",
    whiteSpace: "nowrap",
    fontSize: "10px",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    lineHeight: "1.3",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    transform: "translate(-50%, -110%)",
    opacity: 0,
    transition:
        "left 180ms ease, top 180ms ease, opacity 150ms ease, transform 150ms ease",
    pointerEvents: "none",
    userSelect: "none",
}

export const typingBadgeVisibleStyle: CSSProperties = {
    opacity: 1,
    transform: "translate(-50%, -110%) translateY(0)",
}

export const typingBadgeNameStyle: CSSProperties = {
    fontWeight: 700,
    color: "#fff",
}

export function useTypingBadges(options: UseTypingBadgesOptions) {
    const typingBadges = ref<TypingBadge[]>([])
    let badgeSyncRaf: number | null = null

    function stopBadgePositionSync() {
        if (badgeSyncRaf !== null) {
            cancelAnimationFrame(badgeSyncRaf)
            badgeSyncRaf = null
        }
    }

    function updateBadgePositions() {
        const pos = options.getCursorPos()
        if (!pos) return

        typingBadges.value.forEach((badge) => {
            badge.x = pos.x
            badge.y = pos.y
        })
    }

    function startBadgePositionSync() {
        stopBadgePositionSync()

        const tick = () => {
            if (!typingBadges.value.some((badge) => badge.visible)) {
                badgeSyncRaf = null
                return
            }

            updateBadgePositions()
            badgeSyncRaf = requestAnimationFrame(tick)
        }

        badgeSyncRaf = requestAnimationFrame(tick)
    }

    function clearTypingBadges() {
        typingBadges.value.forEach((badge) => {
            if (badge.timer) clearTimeout(badge.timer)
        })
        typingBadges.value = []
        stopBadgePositionSync()
    }

    function applyTypingBadge(from: string) {
        if (options.isSuppressed?.()) return

        const pos = options.getCursorPos()
        if (!pos) return

        const existing = typingBadges.value.find((badge) => badge.from === from)
        const visibleDurationMs = options.visibleDurationMs ?? 2000

        if (existing) {
            if (existing.timer) clearTimeout(existing.timer)
            existing.x = pos.x
            existing.y = pos.y
            existing.visible = true
            existing.timer = setTimeout(() => {
                existing.visible = false
                existing.timer = null
                if (!typingBadges.value.some((badge) => badge.visible)) {
                    stopBadgePositionSync()
                }
            }, visibleDurationMs)
        } else {
            const badge: TypingBadge = {
                from,
                x: pos.x,
                y: pos.y,
                visible: true,
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                timer: setTimeout(() => {
                    badge.visible = false
                    badge.timer = null
                    if (!typingBadges.value.some((badge) => badge.visible)) {
                        stopBadgePositionSync()
                    }
                }, visibleDurationMs),
            }
            typingBadges.value.push(badge)
        }

        startBadgePositionSync()
    }

    onBeforeUnmount(() => {
        clearTypingBadges()
    })

    return {
        typingBadges,
        applyTypingBadge,
        clearTypingBadges,
        stopBadgePositionSync,
    }
}

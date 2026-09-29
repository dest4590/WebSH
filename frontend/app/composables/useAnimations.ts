import { nextTick, onBeforeUnmount, ref, type Ref } from "vue"

export function useAnimations(
    animationDuration: Ref<string>,
    settings: Ref<any>
) {
    const isClosing = ref(false)
    let closeTimer: number | null = null

    const parseDurationMs = (duration: string) => {
        const value = parseFloat(duration)
        if (Number.isNaN(value)) {
            return 200
        }
        return value * (duration.includes("ms") ? 1 : 1000)
    }

    const captureLeafElements = () => {
        const els = Array.from(
            document.querySelectorAll<HTMLElement>("[data-terminal-id]")
        )
        const map = new Map<string, { el: HTMLElement; rect: DOMRect }>()
        for (const el of els) {
            const id = el.getAttribute("data-terminal-id")
            if (!id) continue
            map.set(id, { el, rect: el.getBoundingClientRect() })
        }
        return map
    }

    const runFlip = async (
        sourceId: string,
        targetId: string,
        side: "left" | "right" | "top" | "bottom",
        placeSessionCallback: (
            sourceId: string,
            targetId: string,
            side: "left" | "right" | "top" | "bottom"
        ) => void
    ) => {
        const before = captureLeafElements()

        placeSessionCallback(sourceId, targetId, side)

        await nextTick()
        await new Promise(requestAnimationFrame)

        const after = captureLeafElements()
        const duration = animationDuration.value || "0.2s"

        const running: Array<Promise<void>> = []

        for (const [id, beforeInfo] of before.entries()) {
            const afterInfo = after.get(id)
            if (!afterInfo) continue

            const dx = beforeInfo.rect.left - afterInfo.rect.left
            const dy = beforeInfo.rect.top - afterInfo.rect.top

            if ((dx === 0 && dy === 0) || !afterInfo.el) continue

            const el = afterInfo.el
            el.style.transition = "none"
            el.style.transform = `translate(${dx}px, ${dy}px)`
            el.style.willChange = "transform"

            el.getBoundingClientRect()

            const p = new Promise<void>((resolve) => {
                const onEnd = (e: TransitionEvent) => {
                    if (e.propertyName !== "transform") return
                    el.removeEventListener("transitionend", onEnd)
                    el.style.transition = ""
                    el.style.transform = ""
                    el.style.willChange = ""
                    resolve()
                }

                el.addEventListener("transitionend", onEnd)

                requestAnimationFrame(() => {
                    el.style.transition = `transform ${duration} ease`
                    el.style.transform = ""
                })
            })

            running.push(p)
        }

        for (const [id, afterInfo] of after.entries()) {
            if (before.has(id)) continue
            const el = afterInfo.el
            el.style.transition = "none"
            el.style.opacity = "0"
            el.style.transform = "scale(0.98)"
            el.style.willChange = "opacity, transform"

            el.getBoundingClientRect()

            const p = new Promise<void>((resolve) => {
                const onEnd = (e: TransitionEvent) => {
                    if (e.propertyName !== "opacity") return
                    el.removeEventListener("transitionend", onEnd)
                    el.style.transition = ""
                    el.style.transform = ""
                    el.style.opacity = ""
                    el.style.willChange = ""
                    resolve()
                }

                el.addEventListener("transitionend", onEnd)

                requestAnimationFrame(() => {
                    el.style.transition = `opacity ${duration} ease, transform ${duration} ease`
                    el.style.opacity = "1"
                    el.style.transform = ""
                })
            })

            running.push(p)
        }

        try {
            await Promise.all(running)
        } catch {}
    }

    const handleClosePane = (
        terminalId: string,
        closePaneCallback: (id: string) => void
    ) => {
        if (isClosing.value || !terminalId) {
            return
        }

        if (!settings.value.animationsEnabled) {
            closePaneCallback(terminalId)
            return
        }

        isClosing.value = true

        const duration = animationDuration.value || "0.2s"
        const timeoutMs = parseDurationMs(duration)

        const before = captureLeafElements()
        const removedInfo = before.get(terminalId)
        let clone: HTMLElement | null = null
        if (removedInfo) {
            clone = removedInfo.el.cloneNode(true) as HTMLElement
            const r = removedInfo.rect
            clone.style.position = "fixed"
            clone.style.left = `${r.left}px`
            clone.style.top = `${r.top}px`
            clone.style.width = `${r.width}px`
            clone.style.height = `${r.height}px`
            clone.style.margin = "0"
            clone.style.boxSizing = "border-box"
            clone.style.pointerEvents = "none"
            clone.style.transition = "none"
            clone.style.willChange = "opacity, transform"
            clone.style.zIndex = "9999"
            document.body.appendChild(clone)
        }

        closePaneCallback(terminalId)
        ;(async () => {
            await nextTick()
            await new Promise(requestAnimationFrame)

            const after = captureLeafElements()

            const running: Array<Promise<void>> = []

            for (const [id, beforeInfo] of before.entries()) {
                const afterInfo = after.get(id)
                if (!afterInfo) continue

                const dx = beforeInfo.rect.left - afterInfo.rect.left
                const dy = beforeInfo.rect.top - afterInfo.rect.top

                if ((dx === 0 && dy === 0) || !afterInfo.el) continue

                const el = afterInfo.el
                el.style.transition = "none"
                el.style.transform = `translate(${dx}px, ${dy}px)`
                el.style.willChange = "transform"

                el.getBoundingClientRect()

                const p = new Promise<void>((resolve) => {
                    const onEnd = (e: TransitionEvent) => {
                        if (e.propertyName !== "transform") return
                        el.removeEventListener("transitionend", onEnd)
                        el.style.transition = ""
                        el.style.transform = ""
                        el.style.willChange = ""
                        resolve()
                    }

                    el.addEventListener("transitionend", onEnd)

                    requestAnimationFrame(() => {
                        el.style.transition = `transform ${duration} ease`
                        el.style.transform = ""
                    })
                })

                running.push(p)
            }

            for (const [id, afterInfo] of after.entries()) {
                if (before.has(id)) continue
                const el = afterInfo.el
                el.style.transition = "none"
                el.style.opacity = "0"
                el.style.transform = "scale(0.98)"
                el.style.willChange = "opacity, transform"

                el.getBoundingClientRect()

                const p = new Promise<void>((resolve) => {
                    const onEnd = (e: TransitionEvent) => {
                        if (e.propertyName !== "opacity") return
                        el.removeEventListener("transitionend", onEnd)
                        el.style.transition = ""
                        el.style.transform = ""
                        el.style.opacity = ""
                        el.style.willChange = ""
                        resolve()
                    }

                    el.addEventListener("transitionend", onEnd)

                    requestAnimationFrame(() => {
                        el.style.transition = `opacity ${duration} ease, transform ${duration} ease`
                        el.style.opacity = "1"
                        el.style.transform = ""
                    })
                })

                running.push(p)
            }

            if (clone) {
                const p = new Promise<void>((resolve) => {
                    const onEnd = (e: TransitionEvent) => {
                        if (e.propertyName !== "opacity") return
                        clone!.removeEventListener("transitionend", onEnd)
                        try {
                            clone!.parentElement?.removeChild(clone!)
                        } catch {}
                        resolve()
                    }

                    clone.addEventListener("transitionend", onEnd)

                    requestAnimationFrame(() => {
                        clone!.style.transition = `opacity ${duration} ease, transform ${duration} ease`
                        clone!.style.opacity = "0"
                        clone!.style.transform = "scale(0.98)"
                    })
                })

                running.push(p)
            }

            try {
                await Promise.all(running)
            } catch {}

            isClosing.value = false
        })()

        closeTimer = window.setTimeout(() => {
            if (clone && clone.parentElement) {
                try {
                    clone.parentElement.removeChild(clone)
                } catch {}
            }
            isClosing.value = false
            closeTimer = null
        }, timeoutMs + 50)
    }

    onBeforeUnmount(() => {
        if (closeTimer !== null) {
            window.clearTimeout(closeTimer)
            closeTimer = null
        }
    })

    return {
        runFlip,
        handleClosePane,
        isClosing,
        parseDurationMs,
    }
}

export default useAnimations

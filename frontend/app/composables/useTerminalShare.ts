/**
 * useTerminalShare
 *
 * Manages the lifecycle of a "Share Terminal" session for a single terminal
 * pane.  The owner:
 *   1. Calls `startSharing(session, { readOnly })` which:
 *      a. Creates a share code via POST /share/create (authenticated).
 *      b. Opens a publisher WebSocket to /share/<code>/publish.
 *      c. Hooks into the session's `outputTap` so all terminal output is
 *         forwarded to the publisher WS and broadcast to watchers.
 *   2. Reads `shareUrl` to show the viewer link.
 *   3. Reads `remainingSecs` for a live countdown (null = no expiry).
 *   4. Calls `stopSharing()` when the user revokes the share.
 *   5. `onExpired` callback is fired when the free-plan timer runs out.
 *
 * Expiry (free plan: 10 min, pro: unlimited) is enforced on the backend.
 */

import { ref, computed } from "vue"
import { useAuth } from "~/composables/useAuth"
import { useApi } from "~/composables/useApi"
import type { TerminalSession } from "~/composables/useTerminalWorkspace"
import { useRuntimeConfig } from "#app"

export interface RoomWatcher {
    id: number
    displayName: string
    readOnly: boolean
}

export const useTerminalShare = () => {
    const { token } = useAuth()
    const { buildUrl } = useApi()
    const runtimeConfig = useRuntimeConfig()

    const shareCode = ref<string | null>(null)
    const watchToken = ref<string | null>(null)
    const expiresInSecs = ref<number | null>(null)
    /** Counts down from expiresInSecs every second.  null = no expiry. */
    const remainingSecs = ref<number | null>(null)
    const isSharing = ref(false)
    const isCreating = ref(false)
    const isExpired = ref(false)
    const error = ref<string | null>(null)
    const watchers = ref<RoomWatcher[]>([])
    const typingEvents = ref<Array<{ from: string; id: string }>>([])

    let publisherWs: WebSocket | null = null
    let ownerTypingSub: { dispose?: () => void } | null = null
    let expiryTimer: ReturnType<typeof setTimeout> | null = null
    let countdownInterval: ReturnType<typeof setInterval> | null = null
    let activeSession: TerminalSession | null = null
    let _onExpired: (() => void) | null = null

    const textEncoder = new TextEncoder()

    const shareUrl = computed(() => {
        if (!shareCode.value || !watchToken.value) return null
        if (!import.meta.client) return null
        const siteBase =
            runtimeConfig.public.siteUrl?.replace(/\/$/, "") ||
            window.location.origin
        return `${siteBase}/shared/${shareCode.value}?token=${encodeURIComponent(watchToken.value)}`
    })

    function resolveWsBase(): string {
        if (runtimeConfig.public.apiBaseUrl?.trim()) {
            return runtimeConfig.public.apiBaseUrl
                .replace(/\/$/, "")
                .replace("https://", "wss://")
                .replace("http://", "ws://")
        }
        if (!import.meta.client) return "ws://127.0.0.1:5151"
        const scheme = window.location.protocol === "https:" ? "wss" : "ws"
        return `${scheme}://${window.location.hostname || "127.0.0.1"}:5151`
    }

    function startCountdown(secs: number) {
        remainingSecs.value = secs
        countdownInterval = setInterval(() => {
            if (remainingSecs.value === null) return
            remainingSecs.value--
            if (remainingSecs.value <= 0) {
                clearInterval(countdownInterval!)
                countdownInterval = null
                remainingSecs.value = 0
            }
        }, 1000)
    }

    function clearCountdown() {
        if (countdownInterval !== null) {
            clearInterval(countdownInterval)
            countdownInterval = null
        }
        remainingSecs.value = null
    }

    async function startSharing(
        session: TerminalSession,
        options: { readOnly: boolean; onExpired?: () => void } = {
            readOnly: true,
        }
    ): Promise<void> {
        if (isSharing.value || isCreating.value) return
        if (!token.value) {
            error.value = "You must be logged in to share a terminal."
            return
        }

        isCreating.value = true
        isExpired.value = false
        error.value = null
        _onExpired = options.onExpired ?? null

        try {
            const res = await fetch(buildUrl("/share/create"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token.value}`,
                },
                body: JSON.stringify({ readOnly: options.readOnly }),
            })

            if (!res.ok) {
                const body = await res.json().catch(() => null)
                throw new Error(body?.error || `Server error ${res.status}`)
            }

            const data: {
                code: string
                expiresInSecs: number | null
                readOnly: boolean
                watchToken: string
            } = await res.json()

            shareCode.value = data.code
            watchToken.value = data.watchToken
            expiresInSecs.value = data.expiresInSecs ?? null

            const wsUrl = `${resolveWsBase()}/share/${data.code}/publish?token=${encodeURIComponent(token.value)}`
            publisherWs = new WebSocket(wsUrl)
            publisherWs.binaryType = "arraybuffer"

            await new Promise<void>((resolve, reject) => {
                publisherWs!.onopen = () => resolve()
                publisherWs!.onerror = () =>
                    reject(new Error("Could not open share publisher socket."))
            })

            activeSession = session
            try {
                ownerTypingSub = activeSession.terminal.onData(
                    (input: string) => {
                        if (
                            publisherWs &&
                            publisherWs.readyState === WebSocket.OPEN
                        ) {
                            try {
                                publisherWs.send(
                                    JSON.stringify({
                                        type: "typing",
                                        text: input,
                                    })
                                )
                            } catch {}
                        }
                    }
                )
            } catch {}
            session.ssh.outputTap.value = (text: string) => {
                if (publisherWs && publisherWs.readyState === WebSocket.OPEN) {
                    publisherWs.send(textEncoder.encode(text).buffer)
                }
            }

            publisherWs.onmessage = (event) => {
                if (typeof event.data === "string") {
                    try {
                        const msg = JSON.parse(event.data)
                        if (
                            msg.type === "room_update" &&
                            Array.isArray(msg.users)
                        ) {
                            watchers.value = msg.users as RoomWatcher[]
                        } else if (msg.type === "typing") {
                            if (
                                typeof msg.from !== "string" ||
                                !msg.from.trim()
                            ) {
                                return
                            }

                            const fromName = msg.from.trim()
                            typingEvents.value.push({
                                from: fromName,
                                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                            })
                            if (typingEvents.value.length > 50) {
                                typingEvents.value.shift()
                            }
                        }
                    } catch {}
                    return
                }
                const data =
                    event.data instanceof ArrayBuffer
                        ? new Uint8Array(event.data)
                        : new Uint8Array((event.data as Blob).size)
                activeSession?.ssh.sendInput(new TextDecoder().decode(data))
            }

            isSharing.value = true

            if (data.expiresInSecs != null) {
                startCountdown(data.expiresInSecs)
                expiryTimer = setTimeout(() => {
                    isExpired.value = true
                    stopSharing(true)
                }, data.expiresInSecs * 1000)
            }

            publisherWs.onclose = () => {
                if (isSharing.value) stopSharing()
            }
        } catch (err_) {
            error.value = String(err_)
            shareCode.value = null
        } finally {
            isCreating.value = false
        }
    }

    function stopSharing(triggerExpiredCb = false): void {
        if (!isSharing.value && !shareCode.value) return

        if (activeSession) {
            activeSession.ssh.outputTap.value = null
            activeSession = null
        }

        if (publisherWs) {
            publisherWs.onclose = null
            publisherWs.close(1000, "Share stopped.")
            publisherWs = null
        }

        if (ownerTypingSub && typeof ownerTypingSub.dispose === "function") {
            try {
                ownerTypingSub.dispose()
            } catch {}
            ownerTypingSub = null
        }

        if (expiryTimer !== null) {
            clearTimeout(expiryTimer)
            expiryTimer = null
        }

        clearCountdown()

        if (shareCode.value && token.value) {
            fetch(buildUrl(`/share/${shareCode.value}`), {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token.value}` },
            }).catch(() => {})
        }

        shareCode.value = null
        watchToken.value = null
        expiresInSecs.value = null
        watchers.value = []
        isSharing.value = false
        error.value = null

        if (triggerExpiredCb && _onExpired) {
            _onExpired()
            _onExpired = null
        }
    }

    async function kickWatcher(watcherId: number): Promise<void> {
        if (!shareCode.value || !token.value) return
        await fetch(
            buildUrl(`/share/${shareCode.value}/users/${watcherId}/kick`),
            {
                method: "POST",
                headers: { Authorization: `Bearer ${token.value}` },
            }
        ).catch(() => {})
    }

    async function banWatcher(watcherId: number): Promise<void> {
        if (!shareCode.value || !token.value) return
        await fetch(
            buildUrl(`/share/${shareCode.value}/users/${watcherId}/ban`),
            {
                method: "POST",
                headers: { Authorization: `Bearer ${token.value}` },
            }
        ).catch(() => {})
    }

    async function setWatcherReadOnly(
        watcherId: number,
        readOnly: boolean
    ): Promise<void> {
        if (!shareCode.value || !token.value) return
        await fetch(buildUrl(`/share/${shareCode.value}/users/${watcherId}`), {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token.value}`,
            },
            body: JSON.stringify({ readOnly }),
        }).catch(() => {})
    }

    return {
        shareCode,
        watchToken,
        shareUrl,
        expiresInSecs,
        remainingSecs,
        isSharing,
        isCreating,
        isExpired,
        error,
        watchers,
        startSharing,
        stopSharing,
        kickWatcher,
        banWatcher,
        setWatcherReadOnly,
        typingEvents,
    }
}

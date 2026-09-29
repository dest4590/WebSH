import { computed } from "vue"
import { useRuntimeConfig } from "#app"

interface ErrorPayload {
    error?: string
}

const DEFAULT_API_HOST = "127.0.0.1"
const DEFAULT_API_PORT = 5151
const DEFAULT_API_BASE = `http://${DEFAULT_API_HOST}:${DEFAULT_API_PORT}`

const normalizeApiBase = (apiBaseUrl?: string) =>
    apiBaseUrl?.trim().replace(/\/$/, "") ?? ""

const resolveClientApiBase = () => {
    const scheme = window.location.protocol === "https:" ? "https" : "http"
    const hostname = window.location.hostname || DEFAULT_API_HOST
    return `${scheme}://${hostname}:${DEFAULT_API_PORT}`
}

const resolveApiBase = (apiBaseUrl?: string) => {
    const configuredBase = normalizeApiBase(apiBaseUrl)
    if (configuredBase) {
        return configuredBase
    }

    return import.meta.client ? resolveClientApiBase() : DEFAULT_API_BASE
}

const createRequestHeaders = (
    initHeaders: HeadersInit | undefined,
    authenticated: boolean,
    token?: string
) => {
    const headers = new Headers(initHeaders)

    if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json")
    }

    if (authenticated && token) {
        headers.set("Authorization", `Bearer ${token}`)
    }

    return headers
}

const readResponsePayload = async <T>(response: Response) =>
    (await response.json().catch(() => null)) as T | ErrorPayload | null

const resolveRequestErrorMessage = (
    payload: ErrorPayload | null,
    status: number
) => payload?.error || `Request failed with status ${status}.`

export const useApi = () => {
    const runtimeConfig = useRuntimeConfig()

    const apiBase = computed(() =>
        resolveApiBase(runtimeConfig.public.apiBaseUrl)
    )

    const buildUrl = (path: string) => `${apiBase.value}${path}`

    const request = async <T>(
        path: string,
        init: RequestInit = {},
        authenticated = false,
        token?: string
    ): Promise<T> => {
        const headers = createRequestHeaders(
            init.headers,
            authenticated,
            token
        )

        const response = await fetch(buildUrl(path), {
            ...init,
            headers,
        })

        const payload = await readResponsePayload<T>(response)

        if (!response.ok) {
            throw new Error(
                resolveRequestErrorMessage(
                    payload as ErrorPayload | null,
                    response.status
                )
            )
        }

        return payload as T
    }

    const authHeaders = (token?: string) => ({
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    })

    return {
        apiBase,
        buildUrl,
        request,
        authHeaders,
    }
}

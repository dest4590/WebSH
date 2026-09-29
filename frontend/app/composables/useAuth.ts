import { computed } from "vue"
import { useApi } from "~/composables/useApi"

const TOKEN_STORAGE_KEY = "websh.auth.token"
const USER_STORAGE_KEY = "websh.auth.user"
const REFRESH_TOKEN_STORAGE_KEY = "websh.auth.refreshToken"

export interface AuthUser {
    id: number
    email: string
    name?: string
    subscriptionTier: string
    subscriptionStart?: number | null
    subscriptionEnd?: number | null
    isAdmin?: boolean
    createdAt: number
}

interface AuthResponse {
    token: string
    refreshToken: string
    user: AuthUser
}

interface AuthRequest {
    email: string
    password: string
    name?: string
}

export const useAuth = () => {
    const token = useState<string | null>("auth-token", () => null)
    const user = useState<AuthUser | null>("auth-user", () => null)
    const refreshToken = useState<string | null>(
        "auth-refresh-token",
        () => null
    )
    const status = useState("auth-status", () => "")
    const initialized = useState("auth-initialized", () => false)
    const pending = useState("auth-pending", () => false)

    const { request } = useApi()

    const isAuthenticated = computed(() => Boolean(token.value && user.value))

    const getStorage = () => {
        if (!import.meta.client) {
            return null
        }

        try {
            return window.localStorage
        } catch {
            return null
        }
    }

    const setSession = (
        nextToken: string | null,
        nextUser: AuthUser | null,
        nextRefreshToken: string | null
    ) => {
        token.value = nextToken
        user.value = nextUser
        refreshToken.value = nextRefreshToken

        const storage = getStorage()
        if (!storage) {
            return
        }

        if (nextToken && nextUser) {
            storage.setItem(TOKEN_STORAGE_KEY, nextToken)
            storage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser))
            if (nextRefreshToken) {
                storage.setItem(REFRESH_TOKEN_STORAGE_KEY, nextRefreshToken)
            } else {
                storage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
            }
            return
        }

        storage.removeItem(TOKEN_STORAGE_KEY)
        storage.removeItem(USER_STORAGE_KEY)
        storage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
    }

    const clearSession = () => {
        setSession(null, null, null)
    }

    const tryRefreshSession = async (): Promise<boolean> => {
        if (!refreshToken.value) {
            return false
        }

        pending.value = true
        try {
            const response = await request<AuthResponse>("/auth/refresh", {
                method: "POST",
                body: JSON.stringify({ refreshToken: refreshToken.value }),
            })
            setSession(response.token, response.user, response.refreshToken)
            status.value = ""
            return true
        } catch (error) {
            clearSession()
            status.value =
                error instanceof Error
                    ? error.message
                    : "Your session has expired."
            return false
        } finally {
            pending.value = false
        }
    }

    const restoreSession = async (refreshUser = true) => {
        if (!initialized.value) {
            if (import.meta.client) {
                const storage = getStorage()
                const storedToken = storage?.getItem(TOKEN_STORAGE_KEY) ?? null
                const storedUser = storage?.getItem(USER_STORAGE_KEY) ?? null
                const storedRefreshToken =
                    storage?.getItem(REFRESH_TOKEN_STORAGE_KEY) ?? null

                token.value = storedToken || null
                user.value = storedUser
                    ? ((JSON.parse(storedUser) as AuthUser) ?? null)
                    : null
                refreshToken.value = storedRefreshToken || null
            }

            initialized.value = true
        }

        if (!token.value) {
            return await tryRefreshSession()
        }

        if (!refreshUser) {
            return Boolean(token.value)
        }

        try {
            const profile = await request<AuthUser>(
                "/auth/me",
                {},
                true,
                token.value ?? undefined
            )
            setSession(token.value, profile, refreshToken.value)
            status.value = ""
            return true
        } catch (error) {
            return await tryRefreshSession()
        }
    }

    const runAuthRequest = async (
        path: string,
        payload: AuthRequest
    ): Promise<boolean> => {
        pending.value = true

        try {
            const response = await request<AuthResponse>(path, {
                method: "POST",
                body: JSON.stringify(payload),
            })

            setSession(response.token, response.user, response.refreshToken)
            status.value = ""
            return true
        } catch (error) {
            clearSession()
            status.value =
                error instanceof Error
                    ? error.message
                    : "Authentication failed."
            return false
        } finally {
            pending.value = false
        }
    }

    const register = async (payload: AuthRequest) =>
        runAuthRequest("/auth/register", payload)

    const login = async (payload: AuthRequest) =>
        runAuthRequest("/auth/login", payload)

    const logout = async () => {
        clearSession()
        status.value = ""
    }

    const updateProfile = async (
        payload: Partial<AuthRequest>
    ): Promise<boolean> => {
        if (!token.value) return false
        pending.value = true
        try {
            const updated = await request<AuthUser>(
                "/auth/me",
                {
                    method: "PUT",
                    body: JSON.stringify(payload),
                },
                true,
                token.value
            )
            setSession(token.value, updated, refreshToken.value)
            status.value = ""
            return true
        } catch (error) {
            status.value =
                error instanceof Error ? error.message : "Update failed."
            return false
        } finally {
            pending.value = false
        }
    }

    return {
        token,
        user,
        status,
        initialized,
        pending,
        isAuthenticated,
        restoreSession,
        register,
        login,
        logout,
        updateProfile,
    }
}

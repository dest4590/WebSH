const PULL_AFTER_LOGIN_KEY = "websh.sync.pull-after-login"

export const requestPullAfterLogin = () => {
    if (!import.meta.client) return
    sessionStorage.setItem(PULL_AFTER_LOGIN_KEY, "1")
}

export const hasPendingPullAfterLogin = () => {
    if (!import.meta.client) return false
    return sessionStorage.getItem(PULL_AFTER_LOGIN_KEY) === "1"
}

export const clearPendingPullAfterLogin = () => {
    if (!import.meta.client) return
    sessionStorage.removeItem(PULL_AFTER_LOGIN_KEY)
}

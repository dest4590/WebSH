import { argon2id } from "@noble/hashes/argon2.js"
import { blake2b } from "@noble/hashes/blake2.js"
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js"
import { db, type EncryptedSecret, type VaultRecord } from "~/lib/db"

const VAULT_SCHEME_PREFIX = "noble-v1:"
const VAULT_VERIFIER_LABEL = "websh-vault-verifier"

const ARGON2_T = 2
const ARGON2_M = 65536
const ARGON2_P = 1
const KEY_BYTES = 32
const NONCE_BYTES = 24
const SALT_BYTES = 16

const SESSION_STORAGE_KEY = "websh_vault_session"

let masterKeyCache: {
    password: string
    salt: string
    key: Uint8Array
} | null = null

function toBase64(bytes: Uint8Array): string {
    let binary = ""
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!)
    }
    return btoa(binary)
}

function fromBase64(str: string): Uint8Array {
    const binary = atob(str)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

function isCurrentScheme(value: string): boolean {
    return value.startsWith(VAULT_SCHEME_PREFIX)
}

function addSchemePrefix(value: string): string {
    return `${VAULT_SCHEME_PREFIX}${value}`
}

function stripSchemePrefix(value: string): string {
    return isCurrentScheme(value)
        ? value.slice(VAULT_SCHEME_PREFIX.length)
        : value
}

function clearMasterKeyCache() {
    if (masterKeyCache) {
        masterKeyCache.key.fill(0)
        masterKeyCache = null
    }
}

function clearSessionCache() {
    try {
        if (typeof sessionStorage !== "undefined") {
            sessionStorage.removeItem(SESSION_STORAGE_KEY)
        }
    } catch {}
}

function createVerifier(masterKey: Uint8Array): string {
    const label = new TextEncoder().encode(VAULT_VERIFIER_LABEL)
    const hash = blake2b(label, { key: masterKey, dkLen: 32 })
    return addSchemePrefix(toBase64(hash))
}

function deriveMasterKey(
    password: string,
    saltBase64: string,
    opsLimit: number
): Uint8Array {
    if (masterKeyCache && masterKeyCache.salt === saltBase64) {
        return masterKeyCache.key
    }

    const salt = fromBase64(saltBase64)
    const key = argon2id(password, salt, {
        t: opsLimit,
        m: ARGON2_M,
        p: ARGON2_P,
        dkLen: KEY_BYTES,
    })

    clearMasterKeyCache()
    masterKeyCache = { password, salt: saltBase64, key }
    return key
}

async function getCurrentMasterKey(password: string): Promise<Uint8Array> {
    const record = await db.vault.get("default")
    if (!record || !isCurrentVaultRecord(record)) {
        throw new Error(
            "Vault must be upgraded before using the current format."
        )
    }
    return deriveMasterKey(password, record.salt, record.iterations)
}

export function isCurrentVaultRecord(record: VaultRecord): boolean {
    return isCurrentScheme(record.passwordVerifier)
}

export function isCurrentEncryptedSecret(secret: EncryptedSecret): boolean {
    return isCurrentScheme(secret.ciphertext)
}

export function clearVaultCryptoCache() {
    clearMasterKeyCache()
    clearSessionCache()
}

export async function persistMasterKeyInSession(
    password: string,
    ttlMs: number
): Promise<void> {
    if (typeof sessionStorage === "undefined") return

    const record = await db.vault.get("default")
    if (!record || !isCurrentVaultRecord(record)) return

    const key = deriveMasterKey(password, record.salt, record.iterations)

    const payload = {
        key: toBase64(key),
        salt: record.salt,
        expiresAt: Date.now() + ttlMs,
    }

    try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload))
    } catch {}
}

export async function tryRestoreMasterKeyFromSession(): Promise<boolean> {
    if (typeof sessionStorage === "undefined") return false

    const record = await db.vault.get("default")
    if (!record || !isCurrentVaultRecord(record)) return false

    try {
        const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
        if (!raw) return false

        const parsed = JSON.parse(raw)
        if (!parsed || parsed.salt !== record.salt) return false
        if (
            typeof parsed.expiresAt !== "number" ||
            parsed.expiresAt < Date.now()
        ) {
            sessionStorage.removeItem(SESSION_STORAGE_KEY)
            return false
        }

        const key = fromBase64(parsed.key)
        try {
            const verifier = createVerifier(key)
            if (verifier !== record.passwordVerifier) {
                sessionStorage.removeItem(SESSION_STORAGE_KEY)
                return false
            }
        } catch {
            sessionStorage.removeItem(SESSION_STORAGE_KEY)
            return false
        }

        clearMasterKeyCache()
        masterKeyCache = { password: "", salt: parsed.salt, key }

        return true
    } catch {
        return false
    }
}

export async function createVaultRecord(
    password: string
): Promise<VaultRecord> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
    const saltBase64 = toBase64(salt)
    const key = deriveMasterKey(password, saltBase64, ARGON2_T)

    return {
        id: "default",
        salt: saltBase64,
        iterations: ARGON2_T,
        passwordVerifier: createVerifier(key),
    }
}

export async function verifyMasterPassword(
    password: string,
    record: VaultRecord
): Promise<boolean> {
    if (!isCurrentVaultRecord(record)) return false
    const key = deriveMasterKey(password, record.salt, record.iterations)
    return createVerifier(key) === record.passwordVerifier
}

export async function encryptSecret<T>(
    password: string,
    secret: T
): Promise<EncryptedSecret> {
    const key = await getCurrentMasterKey(password)
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
    const plaintext = new TextEncoder().encode(JSON.stringify(secret))
    const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext)

    return {
        ciphertext: addSchemePrefix(toBase64(ciphertext)),
        iv: toBase64(nonce),
        salt: "",
        iterations: 0,
    }
}

export async function decryptSecret<T>(
    password: string,
    secret: EncryptedSecret
): Promise<T> {
    if (!isCurrentEncryptedSecret(secret)) {
        throw new Error(
            "Unsupported vault format. Clear local browser data and recreate the vault."
        )
    }

    const key = await getCurrentMasterKey(password)
    const nonce = fromBase64(secret.iv)
    const ciphertext = fromBase64(stripSchemePrefix(secret.ciphertext))

    try {
        const plaintext = xchacha20poly1305(key, nonce).decrypt(ciphertext)
        return JSON.parse(new TextDecoder().decode(plaintext)) as T
    } catch {
        throw new Error("Decryption failed: wrong password or corrupted data.")
    }
}

/**
 * End-to-end encryption for cloud sync.
 *
 * Security model:
 *  - The sync key is derived from the user's master password via Argon2id
 *    using a deterministic 16-byte salt computed as:
 *      BLAKE2b_16( lower(email) || ":websh-e2ee-sync-v1" )
 *    This makes the same key reproducible on any device that knows the
 *    master password and email, with no server-stored secret.
 *  - Each payload is encrypted with XChaCha20-Poly1305
 *    using a random 24-byte nonce, so ciphertexts differ on each push.
 *  - The server receives and stores only { nonce, ciphertext, version } -
 *    it never sees plaintext or the master password.
 *  - The sync key cache is cleared whenever the vault is locked.
 */

import { argon2id } from "@noble/hashes/argon2.js"
import { blake2b } from "@noble/hashes/blake2.js"
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js"

const SYNC_PURPOSE_SUFFIX = ":websh-e2ee-sync-v1"
const KEY_BYTES = 32
const NONCE_BYTES = 24
const SALT_BYTES = 16

let cachedKey: Uint8Array | null = null
let cachedMaterial: string | null = null

function toBase64url(bytes: Uint8Array): string {
    let binary = ""
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!)
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "")
}

function fromBase64url(str: string): Uint8Array {
    const padded = str.replace(/-/g, "+").replace(/_/g, "/")
    const withPad = padded.padEnd(
        padded.length + ((4 - (padded.length % 4)) % 4),
        "="
    )
    const binary = atob(withPad)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

async function getSyncKey(
    masterPassword: string,
    userEmail: string
): Promise<Uint8Array> {
    const material = `${masterPassword}\x00${userEmail.toLowerCase()}`
    if (cachedKey && cachedMaterial === material) {
        return cachedKey
    }

    const emailBytes = new TextEncoder().encode(
        userEmail.toLowerCase() + SYNC_PURPOSE_SUFFIX
    )
    const salt = blake2b(emailBytes, { dkLen: SALT_BYTES })

    const key = argon2id(masterPassword, salt, {
        t: 2,
        m: 65536,
        p: 1,
        dkLen: KEY_BYTES,
    })

    cachedKey = key
    cachedMaterial = material
    return key
}

export interface SyncEnvelope {
    v: 1
    nonce: string
    ct: string
}

export async function encryptForSync(
    data: unknown,
    masterPassword: string,
    userEmail: string
): Promise<SyncEnvelope> {
    const key = await getSyncKey(masterPassword, userEmail)
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
    const plaintext = new TextEncoder().encode(JSON.stringify(data))
    const ct = xchacha20poly1305(key, nonce).encrypt(plaintext)

    return {
        v: 1,
        nonce: toBase64url(nonce),
        ct: toBase64url(ct),
    }
}

export async function decryptFromSync<T>(
    envelope: SyncEnvelope,
    masterPassword: string,
    userEmail: string
): Promise<T> {
    const key = await getSyncKey(masterPassword, userEmail)
    const nonce = fromBase64url(envelope.nonce)
    const ct = fromBase64url(envelope.ct)

    try {
        const plaintext = xchacha20poly1305(key, nonce).decrypt(ct)
        return JSON.parse(new TextDecoder().decode(plaintext)) as T
    } catch {
        throw new Error(
            "Sync decryption failed - wrong master password or corrupted data."
        )
    }
}

/** Call this whenever the vault is locked so stale keys don't linger. */
export function clearSyncKeyCache() {
    cachedKey = null
    cachedMaterial = null
}

import Dexie, { type Table } from "dexie"

export type AuthType = "password" | "privateKey"

export interface EncryptedSecret {
    ciphertext: string
    iv: string
    salt: string
    iterations: number
}

export interface ServerRecord {
    id?: number
    name: string
    host: string
    port: number
    username: string
    authType: AuthType
    secret: EncryptedSecret
    createdAt: number
    updatedAt: number
    isBookmarked?: boolean
    hostKey?: string
}

export interface VaultRecord {
    id: "default"
    passwordVerifier: string
    salt: string
    iterations: number
}

export interface SnippetRecord {
    id?: number
    title: string
    script: string
    runDir: string
    createdAt: number
    updatedAt: number
}

class WebSHDatabase extends Dexie {
    servers!: Table<ServerRecord, number>
    vault!: Table<VaultRecord, string>
    snippets!: Table<SnippetRecord, number>

    constructor() {
        super("websh-shell")

        this.version(1).stores({
            servers: "++id, name, host, updatedAt, isBookmarked",
            snippets: "++id, title, updatedAt",
            vault: "id",
        })
    }
}

export const db = new WebSHDatabase()

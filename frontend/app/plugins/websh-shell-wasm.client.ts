interface WasmSshSession {
    pushServerBytes(data: Uint8Array): void
    drainOutput(): Uint8Array
    sendInput(data: Uint8Array): Promise<Uint8Array>
    resizeTerminal(cols: number, rows: number): Promise<Uint8Array>
    pollOutput(): Promise<Uint8Array>
    close(): Promise<void>
}

export interface WasmSshExecSession {
    pushServerBytes(data: Uint8Array): void
    drainOutput(): Uint8Array
    execBytes(command: string): Promise<Uint8Array>
    free(): void
}

export interface WasmSshPersistentExec {
    pushServerBytes(data: Uint8Array): void
    drainOutput(): Uint8Array
    isConnected(): boolean
    connect(): Promise<void>
    execBytes(command: string): Promise<Uint8Array>
    disconnect(): Promise<void>
    free(): void
}

interface WasmModule {
    default(
        input?:
            | { module_or_path: string | Promise<string> }
            | string
            | Promise<string>
    ): Promise<void>
    connect(credentials: unknown): Promise<WasmSshSession>
    WasmSshExecSession: new (credentials: unknown) => WasmSshExecSession
    WasmSshPersistentExec: new (credentials: unknown) => WasmSshPersistentExec
}

let cachedModule: Promise<WasmModule> | null = null

export default defineNuxtPlugin(() => {
    const load = async (): Promise<WasmModule> => {
        if (!cachedModule) {
            const modulePath = new URL(
                "/wasm/websh_shell_wasm.js",
                window.location.origin
            ).href
            const wasmPath = new URL(
                "/wasm/websh_shell_wasm_bg.wasm",
                window.location.origin
            ).href

            cachedModule = import(/* @vite-ignore */ modulePath).then(
                async (module) => {
                    const typedModule = module as unknown as WasmModule
                    await typedModule.default({ module_or_path: wasmPath })
                    return typedModule
                }
            )
        }

        return cachedModule
    }

    return {
        provide: {
            WebSHWasm: {
                load,
            },
        },
    }
})

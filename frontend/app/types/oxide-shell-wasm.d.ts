declare module "#app" {
    interface WasmSessionMetadata {
        host?: string
        port?: number
        username?: string
        outboundSequence: number
        inboundSequence: number
        state:
            | "created"
            | "handshakePrepared"
            | "bannerExchanged"
            | "unsupportedHandshake"
    }

    interface NuxtApp {
        $WebSHWasm: {
            load: () => Promise<{
                connect(credentials: unknown): Promise<{
                    pushServerBytes(data: Uint8Array): void
                    drainOutput(): Uint8Array
                    sendInput(data: Uint8Array): Promise<Uint8Array>
                    resizeTerminal(
                        cols: number,
                        rows: number
                    ): Promise<Uint8Array>
                    pollOutput(): Promise<Uint8Array>
                    close(): Promise<void>
                }>
            }>
        }
    }
}

export {}

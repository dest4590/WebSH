export const useVaultCrypto = () => {
    const loadVaultCrypto = async () => {
        if (!import.meta.client) {
            throw new Error("Vault crypto is only available on the client.")
        }

        return import("../lib/vault")
    }

    return {
        loadVaultCrypto,
    }
}

import { config as dotenvConfig } from "dotenv"

declare const process: {
    env: Record<string, string | undefined>
}

dotenvConfig({ path: "../.env", override: false })

const siteUrl = process.env.NUXT_PUBLIC_SITE_URL ?? "https://websh.dev"

const config = {
    site: {
        url: siteUrl,
    },
    css: ["~/assets/css/main.css"],
    compatibilityDate: "2025-07-15",
    devtools: { enabled: true },
    app: {
        head: {
            htmlAttrs: {
                lang: "en",
            },
            title: "WebSH",
            meta: [
                { charset: "utf-8" },
                {
                    name: "viewport",
                    content:
                        "width=device-width, initial-scale=1, viewport-fit=cover",
                },
                {
                    name: "description",
                    content:
                        "Secure browser-based SSH client built with Rust and WebAssembly. Zero server-side credential storage, encrypted vault, and terminal tiling.",
                },
                {
                    name: "theme-color",
                    content: "#000000",
                },
                {
                    property: "og:type",
                    content: "website",
                },
                {
                    property: "og:title",
                    content: "WebSH - Browser-based SSH client",
                },
                {
                    property: "og:description",
                    content:
                        "Secure browser-based SSH client built with Rust and WebAssembly. No server-side credential storage and encrypted local key vault.",
                },
                {
                    property: "og:image",
                    content: "/logo.png",
                },
                {
                    property: "og:site_name",
                    content: "WebSH",
                },
                {
                    name: "twitter:card",
                    content: "summary_large_image",
                },
                {
                    name: "twitter:title",
                    content: "WebSH - Browser-based SSH client",
                },
                {
                    name: "twitter:description",
                    content:
                        "Secure browser-based SSH client built with Rust and WebAssembly. No server-side credential storage and encrypted local key vault.",
                },
                {
                    name: "twitter:image",
                    content: "/logo.png",
                },
            ],
            link: [{ rel: "icon", type: "image/x-icon", href: "/favicon.ico" }],
        },
        pageTransition: { name: "page", mode: "out-in" },
    },

    vite: {
        build: {
            sourcemap: false,
        },
        optimizeDeps: {
            include: [
                "@vue/devtools-core",
                "@vue/devtools-kit",
                "@xterm/addon-fit",
                "@xterm/xterm",
                "dexie",
                "@xterm/addon-search",
                "@xterm/addon-web-links",
                "@xterm/addon-unicode11",
                "@xterm/addon-web-fonts",
                "vue-codemirror",
                "@codemirror/view",
                "@codemirror/commands",
                "@codemirror/language",
                "@codemirror/legacy-modes/mode/shell",
                "@codemirror/theme-one-dark",
                "@noble/hashes/argon2.js",
                "@noble/hashes/blake2.js",
                "@noble/ciphers/chacha.js",
            ],
        },
    },
    postcss: {
        plugins: {
            "@tailwindcss/postcss": {},
        },
    },
    runtimeConfig: {
        public: {
            proxyBaseUrl: process.env.NUXT_PUBLIC_PROXY_BASE_URL ?? "",
            apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? "",
        },
    },
    modules: ["@nuxtjs/sitemap"],
    sitemap: {
        enabled: true,
        sitemapName: "sitemap.xml",
        includeAppSources: false,
        zeroRuntime: true,
        exclude: ["/app/admin"],
        autoLastmod: true,
        sortEntries: true,
        defaults: {
            changefreq: "weekly",
            priority: 0.7,
        },
        urls: ["/", "/plans", "/profile", "/app"],
    },
}

export default config

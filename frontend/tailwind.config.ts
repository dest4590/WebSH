import type { Config } from "tailwindcss"

export default {
    content: [
        "./app/**/*.{vue,js,ts}",
        "./components/**/*.{vue,js,ts}",
        "./plugins/**/*.{js,ts}",
        "./nuxt.config.{js,ts}",
    ],
    theme: {
        extend: {
            colors: {
                shell: {
                    ink: "#e8f3ff",
                    muted: "#97abc0",
                    accent: "#8ec5ff",
                    ember: "#ffd27d",
                    panel: "#071728",
                },
            },
            fontFamily: {
                display: [
                    "Space Grotesk",
                    "Avenir Next",
                    "Segoe UI",
                    "sans-serif",
                ],
                mono: [
                    "IBM Plex Mono",
                    "Fira Code",
                    "ui-monospace",
                    "monospace",
                ],
            },
            boxShadow: {
                shell: "0 18px 50px rgba(3, 10, 18, 0.38)",
            },
        },
    },
} satisfies Config

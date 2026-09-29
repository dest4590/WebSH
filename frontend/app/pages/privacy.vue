<template>
    <div class="max-w-4xl mx-auto px-4 py-12 prose prose-invert">
        <div class="flex justify-center mb-6">
            <NuxtLink to="/" class="ws-btn w-full text-center">back</NuxtLink>
        </div>

        <h1>Privacy Policy</h1>
        <p>Last Updated: April 14, 2026</p>

        <section>
            <h2>1. Introduction</h2>
            <p>
                WebSH ("we", "our", or "us") is committed to protecting your
                privacy. This Privacy Policy explains how we collect, use, and
                safeguard your information when you use our web-based SSH
                client.
            </p>
        </section>

        <section>
            <h2>2. Information We Collect</h2>
            <h3>a. Account Information</h3>
            <p>
                When you register for an account, we collect your email address
                and an optional name. Your password is encrypted using
                memory-hard Argon2 hashing before being stored in our database.
            </p>

            <h3>b. Encrypted Vault Data</h3>
            <p>
                Your SSH profiles, private keys, and snippets are stored in your
                browser's local storage (IndexedDB). This data is encrypted
                client-side using AES-GCM with a master secret that only you
                know. We never receive or store your master secret or your
                unencrypted private keys.
            </p>

            <h3>c. Cloud Sync (Pro Plan)</h3>
            <p>
                If you use our Cloud Sync feature, we store the encrypted blobs
                of your vault data on our servers. Because this data is
                encrypted with your master secret before being uploaded, we
                cannot read or access the contents of your synced data.
            </p>

            <h3>d. Connection Metadata</h3>
            <p>
                To facilitate SSH sessions, our backend or tunnel nodes may
                temporarily process connection metadata (such as target host and
                port). This information is ephemeral and is not stored
                permanently.
            </p>
        </section>

        <section>
            <h2>3. How We Use Your Information</h2>
            <ul>
                <li>To provide and maintain the WebSH service.</li>
                <li>To manage your account and subscription tier.</li>
                <li>
                    To facilitate secure synchronization of your encrypted data
                    across devices.
                </li>
                <li>To provide customer support and respond to inquiries.</li>
            </ul>
        </section>

        <section>
            <h2>4. Data Security</h2>
            <p>
                We prioritize security by design. We use industry-standard
                encryption for data in transit (TLS/HTTPS) and at rest. Our
                "Zero-Knowledge" architecture ensures that your most sensitive
                secrets (SSH keys) remain under your exclusive control.
            </p>
        </section>

        <section>
            <h2>5. Third-Party Services</h2>
            <p>
                We do not sell your personal information. We may use third-party
                service providers for infrastructure (e.g., cloud hosting) or
                payment processing, who are bound by their own privacy policies.
            </p>
        </section>

        <section>
            <h2>6. Your Rights</h2>
            <p>
                You have the right to access, correct, or delete your account
                information. You can manage your local vault data directly
                within the application.
            </p>
        </section>

        <section>
            <h2>7. Contact Us</h2>
            <p>
                If you have any questions about this Privacy Policy, please
                contact us at contact@websh.dev
            </p>
        </section>
    </div>
</template>

<script setup lang="ts">
useHead({
    title: "Privacy Policy - WebSH",
})
</script>

<template>
    <div class="max-w-4xl mx-auto px-4 py-12 prose prose-invert">
        <div class="flex justify-center mb-6">
            <NuxtLink to="/" class="ws-btn w-full text-center">back</NuxtLink>
        </div>

        <h1>Terms of Service</h1>
        <p>Last Updated: April 14, 2026</p>

        <section>
            <h2>1. Acceptance of Terms</h2>
            <p>
                By accessing or using WebSH, you agree to be bound by these
                Terms of Service. If you do not agree to these terms, please do
                not use our service.
            </p>
        </section>

        <section>
            <h2>2. Description of Service</h2>
            <p>
                WebSH provides a web-based SSH client that allows you to manage
                and connect to remote servers. We offer both free (Starter) and
                paid (Pro) subscription tiers.
            </p>
        </section>

        <section>
            <h2>3. User Accounts</h2>
            <p>
                You are responsible for maintaining the confidentiality of your
                account credentials and your master secret. You are solely
                responsible for all activities that occur under your account.
            </p>
        </section>

        <section>
            <h2>4. Subscription Plans</h2>
            <h3>a. Starter Plan (Free)</h3>
            <p>
                The Starter plan is free of charge and includes limited
                features, such as a maximum of 2 concurrent sessions and
                local-only storage.
            </p>

            <h3>b. Pro Plan (Developer)</h3>
            <p>
                The Pro plan is a paid subscription that includes additional
                features, such as Cloud Sync (E2EE), unlimited sessions, and
                priority access to high-speed nodes.
            </p>

            <h3>c. Early Bird Lifetime</h3>
            <p>
                The Early Bird Lifetime plan is a one-time payment that provides
                permanent access to all Pro features for the life of the
                service.
            </p>

            <h3>d. Refund Policy</h3>
            <p>
                We offer a 14-day money-back guarantee for all paid plans. For
                more details, please see our
                <NuxtLink
                    to="/refund"
                    class="underline underline-offset-2 hover:text-white"
                    >Refund Policy</NuxtLink
                >.
            </p>
        </section>

        <section>
            <h2>5. Prohibited Conduct</h2>
            <p>
                You agree not to use WebSH for any unlawful purpose or in any
                way that violates these Terms. This includes, but is not limited
                to, unauthorized access to systems, distributing malware, or
                interfering with the service's operation.
            </p>
        </section>

        <section>
            <h2>6. Limitation of Liability</h2>
            <p>
                WebSH is provided "as is" without warranties of any kind. We are
                not liable for any damages arising from your use of the service,
                including data loss or unauthorized access to your servers.
            </p>
        </section>

        <section>
            <h2>7. Termination</h2>
            <p>
                We reserve the right to suspend or terminate your account at our
                discretion, with or without notice, for any violation of these
                Terms.
            </p>
        </section>

        <section>
            <h2>8. Changes to Terms</h2>
            <p>
                We may update these Terms of Service from time to time. We will
                notify you of any significant changes by posting the new terms
                on our website.
            </p>
        </section>

        <section>
            <h2>9. Contact Us</h2>
            <p>
                If you have any questions about these Terms of Service, please
                contact us at support@websh.io.
            </p>
        </section>
    </div>
</template>

<script setup lang="ts">
useHead({
    title: "Terms of Service - WebSH",
})
</script>

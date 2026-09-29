<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useAuth } from "~/composables/useAuth"
import { useDialog } from "~/composables/useDialog"
import { useRuntimeConfig } from "#app"

const { token } = useAuth()
const { showAlert } = useDialog()
const users = ref<any[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const nodes = ref<any[]>([])
const nodesLoading = ref(false)
const nodesError = ref<string | null>(null)

const runtimeConfig = useRuntimeConfig()
const apiBase = (() => {
    if (runtimeConfig.public.apiBaseUrl?.trim()) {
        return runtimeConfig.public.apiBaseUrl.replace(/\/$/, "")
    }

    if (!import.meta.client) {
        return "http://127.0.0.1:5151"
    }

    const scheme = window.location.protocol === "https:" ? "https" : "http"
    return `${scheme}://${window.location.hostname || "127.0.0.1"}:5151`
})()

async function fetchUsers() {
    if (!token.value) return
    loading.value = true
    error.value = null

    try {
        const res = await fetch(
            (apiBase || window.location.origin.replace(/:\/\/.*/, ":5151")) +
                "/auth/admin/users",
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token.value}`,
                },
            }
        )

        if (!res.ok) {
            const payload = await res.json().catch(() => ({}))
            throw new Error(payload.error || `HTTP ${res.status}`)
        }

        users.value = await res.json()
    } catch (e: any) {
        error.value = e.message || String(e)
    } finally {
        loading.value = false
    }
}

const { restoreSession } = useAuth()

onMounted(async () => {
    await restoreSession()
    fetchUsers()
    fetchNodes()
})

async function fetchNodes() {
    if (!token.value) return
    nodesLoading.value = true
    nodesError.value = null

    try {
        const res = await fetch(
            (apiBase || window.location.origin.replace(/:\/\/.*/, ":5151")) +
                "/auth/admin/nodes",
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token.value}`,
                },
            }
        )

        if (!res.ok) {
            const payload = await res.json().catch(() => ({}))
            throw new Error(payload.error || `HTTP ${res.status}`)
        }

        nodes.value = await res.json()
    } catch (e: any) {
        nodesError.value = e.message || String(e)
    } finally {
        nodesLoading.value = false
    }
}

function toIso(ts: number | null | undefined) {
    return ts ? new Date(ts * 1000).toISOString().slice(0, 10) : ""
}

function onDateInput(
    e: Event,
    u: any,
    field: "subscriptionStart" | "subscriptionEnd"
) {
    const target = e.target as HTMLInputElement | null
    const val = target ? target.value : ""
    u[field] = val ? Math.floor(new Date(val).getTime() / 1000) : null
}

async function saveSubscription(u: any) {
    if (!token.value) return

    const payload: any = {
        subscriptionTier: u.subscriptionTier,
        subscriptionStart: u.subscriptionStart || null,
        subscriptionEnd: u.subscriptionEnd || null,
        isAdmin: u.isAdmin || false,
    }

    try {
        const res = await fetch(
            (apiBase || window.location.origin.replace(/:\/\/.*/, ":5151")) +
                `/auth/admin/users/${u.id}/subscription`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token.value}`,
                },
                body: JSON.stringify(payload),
            }
        )

        if (!res.ok) {
            const payload = await res.json().catch(() => ({}))
            throw new Error(payload.error || `HTTP ${res.status}`)
        }

        const updated = await res.json()
        const idx = users.value.findIndex((x) => x.id === updated.id)
        if (idx !== -1) users.value[idx] = updated
        else users.value.unshift(updated)
    } catch (e: any) {
        await showAlert(e.message || String(e), {
            title: "Error",
            okLabel: "OK",
        })
    }
}
</script>

<template>
    <div class="p-6">
        <h1 class="text-2xl font-bold mb-4">Admin - User Subscriptions</h1>

        <div v-if="loading">Loading…</div>
        <div v-if="error" class="text-red-500">{{ error }}</div>

        <table v-if="!loading" class="w-full text-sm border-collapse">
            <thead>
                <tr class="text-left text-xs text-secondary">
                    <th class="pb-2">ID</th>
                    <th class="pb-2">Email</th>
                    <th class="pb-2">Tier</th>
                    <th class="pb-2">Start</th>
                    <th class="pb-2">End</th>
                    <th class="pb-2">Admin</th>
                    <th class="pb-2">Actions</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="u in users" :key="u.id" class="border-t">
                    <td class="py-2">{{ u.id }}</td>
                    <td class="py-2">{{ u.email }}</td>
                    <td class="py-2">
                        <select
                            v-model="u.subscriptionTier"
                            class="bg-black border px-2 py-1"
                        >
                            <option value="free">free</option>
                            <option value="pro">pro</option>
                        </select>
                    </td>
                    <td class="py-2">
                        <input
                            type="date"
                            :value="toIso(u.subscriptionStart)"
                            @input="
                                (e) => onDateInput(e, u, 'subscriptionStart')
                            "
                            class="bg-black border px-2 py-1"
                        />
                    </td>
                    <td class="py-2">
                        <input
                            type="date"
                            :value="toIso(u.subscriptionEnd)"
                            @input="(e) => onDateInput(e, u, 'subscriptionEnd')"
                            class="bg-black border px-2 py-1"
                        />
                    </td>
                    <td class="py-2">
                        <input
                            type="checkbox"
                            v-model="u.isAdmin"
                            class="w-4 h-4"
                        />
                    </td>
                    <td class="py-2">
                        <button
                            @click.prevent="saveSubscription(u)"
                            class="ws-btn px-3 py-1 text-xs"
                        >
                            Save
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>
        <div class="mt-8">
            <h2 class="text-xl font-bold mb-3">Tunnel Nodes</h2>

            <div v-if="nodesLoading">Loading…</div>
            <div v-if="nodesError" class="text-red-500">{{ nodesError }}</div>

            <table v-if="!nodesLoading" class="w-full text-sm border-collapse">
                <thead>
                    <tr class="text-left text-xs text-secondary">
                        <th class="pb-2">Name</th>
                        <th class="pb-2">Tier</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="n in nodes" :key="n.name" class="border-t">
                        <td class="py-2">{{ n.name }}</td>
                        <td class="py-2">{{ n.tier }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

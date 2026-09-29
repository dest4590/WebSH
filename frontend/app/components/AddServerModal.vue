<script setup lang="ts">
import { computed, ref, watch } from "vue"
import Dialog from "~/components/Dialog.vue"
import type { AuthType } from "~/lib/db"

interface ServerFormFields {
    name: string
    host: string
    port: number
    username: string
    authType: AuthType
    password: string
    privateKeyPem: string
    passphrase: string
}

const props = defineProps<{
    open: boolean
    vaultReady: boolean
    initialForm?: ServerFormFields | null
    isEditing?: boolean
}>()

const emit = defineEmits<{
    (e: "close"): void
    (e: "save"): void
}>()

const keyInputRef = ref<HTMLInputElement | null>(null)
const keyFileName = ref<string | null>(null)

const form = ref<ServerFormFields>({
    name: "",
    host: "",
    port: 22,
    username: "root",
    authType: "password",
    password: "",
    privateKeyPem: "",
    passphrase: "",
})

const title = computed(() =>
    props.isEditing ? "Edit Server Profile" : "Add Server Profile"
)

const saveLabel = computed(() =>
    props.isEditing ? "Save Changes" : "Save Profile"
)

const applyInitialForm = (initialForm?: ServerFormFields | null) => {
    if (initialForm) {
        form.value = { ...initialForm }
        if (
            initialForm.authType === "privateKey" &&
            initialForm.privateKeyPem
        ) {
            keyFileName.value = "Loaded key"
        } else {
            keyFileName.value = null
        }
    }
}

watch(
    () => props.initialForm,
    (value) => {
        if (props.open) {
            applyInitialForm(value)
        }
    }
)

watch(
    () => props.open,
    (open) => {
        if (open) {
            applyInitialForm(props.initialForm)
        } else {
            resetForm()
        }
    }
)

const onKeyFile = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input?.files?.[0]
    if (!file) return
    try {
        const txt = await file.text()
        form.value.privateKeyPem = txt
        keyFileName.value = file.name
    } catch (err) {
        form.value.privateKeyPem = ""
        keyFileName.value = null
    }
}

const triggerKeyPicker = () => keyInputRef.value?.click()

const clearKey = () => {
    form.value.privateKeyPem = ""
    keyFileName.value = null
    if (keyInputRef.value) keyInputRef.value.value = ""
}

const handleSave = () => {
    emit("save")
    resetForm()
}

const handleClose = () => {
    emit("close")
    resetForm()
}

const resetForm = () => {
    form.value = {
        name: "",
        host: "",
        port: 22,
        username: "root",
        authType: "password",
        password: "",
        privateKeyPem: "",
        passphrase: "",
    }
    keyFileName.value = null
    if (keyInputRef.value) keyInputRef.value.value = ""
}

defineExpose({
    form,
})
</script>

<template>
    <Dialog :open="open" :max-width="'500px'" @close="handleClose">
        <template #header>
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-bold text-white">{{ title }}</h2>
                <button
                    class="text-secondary hover:text-white transition-colors cursor-pointer"
                    @click="handleClose"
                    aria-label="Close dialog"
                >
                    <span aria-hidden="true">×</span>
                </button>
            </div>
        </template>

        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                    <label class="ws-label">Name</label>
                    <input
                        v-model="form.name"
                        type="text"
                        placeholder="production"
                        class="ws-input"
                    />
                </div>
                <div class="flex flex-col gap-1">
                    <label class="ws-label">Host</label>
                    <input
                        v-model="form.host"
                        type="text"
                        placeholder="192.168.1.1"
                        class="ws-input"
                    />
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                    <label class="ws-label">Port</label>
                    <input
                        v-model.number="form.port"
                        type="number"
                        class="ws-input"
                    />
                </div>
                <div class="flex flex-col gap-1">
                    <label class="ws-label">Username</label>
                    <input
                        v-model="form.username"
                        type="text"
                        placeholder="root"
                        class="ws-input"
                    />
                </div>
            </div>

            <div class="flex flex-col gap-1">
                <label class="ws-label">Authentication</label>
                <div class="flex gap-0 border border-(--border-light)">
                    <button
                        class="flex-1 py-2 text-xs font-mono uppercase transition-colors"
                        :class="
                            form.authType === 'password'
                                ? 'bg-white text-black'
                                : 'bg-transparent text-secondary hover:text-white'
                        "
                        @click="form.authType = 'password'"
                    >
                        Password
                    </button>
                    <button
                        class="flex-1 py-2 text-xs font-mono uppercase border-l transition-colors"
                        :class="
                            form.authType === 'privateKey'
                                ? 'bg-white text-black'
                                : 'bg-transparent text-secondary hover:text-white'
                        "
                        :style="{
                            borderLeftColor: 'var(--border-light)',
                        }"
                        @click="form.authType = 'privateKey'"
                    >
                        SSH Key
                    </button>
                </div>
            </div>

            <div
                v-if="form.authType === 'password'"
                class="flex flex-col gap-1"
            >
                <label class="ws-label">Password</label>
                <input
                    v-model="form.password"
                    type="password"
                    class="ws-input"
                />
            </div>

            <div v-else class="space-y-3">
                <div class="flex flex-col gap-1">
                    <label class="ws-label">Private Key (PEM)</label>
                    <input
                        ref="keyInputRef"
                        type="file"
                        accept=".pem,.key,text/plain"
                        class="hidden"
                        @change="onKeyFile"
                    />
                    <div class="flex items-center gap-2">
                        <button
                            type="button"
                            class="ws-btn px-3 py-1"
                            @click="triggerKeyPicker"
                        >
                            Upload Key
                        </button>
                        <span
                            v-if="keyFileName"
                            class="text-xs text-secondary truncate"
                            >{{ keyFileName }}</span
                        >
                        <span v-else class="text-xs">No file chosen</span>
                        <button
                            v-if="form.privateKeyPem"
                            type="button"
                            class="text-xs text-red-500 hover:text-red-400 transition-colors"
                            @click="clearKey"
                        >
                            Remove
                        </button>
                    </div>
                </div>
                <div class="flex flex-col gap-1">
                    <label class="ws-label">Passphrase (Optional)</label>
                    <input
                        v-model="form.passphrase"
                        type="password"
                        class="ws-input"
                    />
                </div>
            </div>
        </div>

        <template #footer>
            <button class="ws-btn" @click="handleClose">Cancel</button>
            <button
                class="ws-btn-primary"
                :disabled="!vaultReady"
                @click="handleSave"
            >
                {{ saveLabel }}
            </button>
        </template>
    </Dialog>
</template>

<script setup lang="ts">
import { computed } from "vue"
import Dialog from "~/components/Dialog.vue"
import { useDialog } from "~/composables/useDialog"

const dialog = useDialog()
const isConfirm = computed(() => dialog.type.value === "confirm")
const title = computed(() => dialog.title.value)
const message = computed(() => dialog.message.value)
const okLabel = computed(() => dialog.okLabel.value ?? "OK")
const cancelLabel = computed(() => dialog.cancelLabel.value ?? "Cancel")

const handleClose = () => {
    dialog.close(false)
}

const handleConfirm = () => {
    dialog.close(true)
}

const handleOk = () => {
    dialog.close(true)
}
</script>

<template>
    <Dialog
        :open="dialog.open.value"
        :maxWidth="dialog.maxWidth.value || '500px'"
        @close="handleClose"
    >
        <template #header>
            <h2 class="text-lg font-semibold">{{ title }}</h2>
        </template>

        <div class="dialog-body whitespace-pre-wrap wrap-break-word">
            {{ message }}
        </div>

        <template #footer>
            <button
                v-if="isConfirm"
                type="button"
                class="ws-btn text-sm"
                @click="handleClose"
            >
                {{ cancelLabel }}
            </button>
            <button
                type="button"
                class="ws-btn-primary text-sm"
                @click="isConfirm ? handleConfirm() : handleOk()"
            >
                {{ okLabel }}
            </button>
        </template>
    </Dialog>
</template>

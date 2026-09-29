import { computed, ref } from "vue"

type DialogType = "alert" | "confirm"

interface DialogOptions {
    title?: string
    okLabel?: string
    cancelLabel?: string
    maxWidth?: string
}

const DEFAULT_DIALOG_MAX_WIDTH = "500px"
const DIALOG_DEFAULTS: Record<
    DialogType,
    { title: string; okLabel: string; cancelLabel: string | null }
> = {
    alert: {
        title: "Alert",
        okLabel: "OK",
        cancelLabel: null,
    },
    confirm: {
        title: "Confirm",
        okLabel: "OK",
        cancelLabel: "Cancel",
    },
}

const open = ref(false)
const title = ref<string | null>(null)
const message = ref<string>("")
const type = ref<DialogType>("alert")
const okLabel = ref<string | null>(null)
const cancelLabel = ref<string | null>(null)
const maxWidth = ref<string | null>(null)
let resolveCallback: ((value: boolean) => void) | null = null

export const useDialog = () => {
    const dialogOpen = computed(() => open.value)
    const dialogTitle = computed(() => title.value)
    const dialogMessage = computed(() => message.value)
    const dialogType = computed(() => type.value)
    const dialogOkLabel = computed(() => okLabel.value)
    const dialogCancelLabel = computed(() => cancelLabel.value)
    const dialogMaxWidth = computed(() => maxWidth.value)

    const closeOpenDialog = () => {
        if (open.value) {
            close(false)
        }
    }

    const reset = () => {
        open.value = false
        title.value = null
        message.value = ""
        type.value = "alert"
        okLabel.value = null
        cancelLabel.value = null
        maxWidth.value = null
        resolveCallback = null
    }

    const close = (result = false) => {
        if (resolveCallback) {
            resolveCallback(result)
        }
        reset()
    }

    const openDialog = (
        dialogType: DialogType,
        text: string,
        options: DialogOptions = {}
    ) => {
        const defaults = DIALOG_DEFAULTS[dialogType]

        title.value = options.title ?? defaults.title
        message.value = text
        type.value = dialogType
        okLabel.value = options.okLabel ?? defaults.okLabel
        cancelLabel.value =
            dialogType === "confirm"
                ? (options.cancelLabel ?? defaults.cancelLabel)
                : null
        maxWidth.value = options.maxWidth ?? DEFAULT_DIALOG_MAX_WIDTH
        open.value = true
    }

    const showAlert = async (
        text: string,
        options?: DialogOptions
    ) => {
        closeOpenDialog()
        openDialog("alert", text, options)

        return new Promise<void>((resolve) => {
            resolveCallback = () => resolve()
        })
    }

    const showConfirm = async (
        text: string,
        options?: DialogOptions
    ) => {
        closeOpenDialog()
        openDialog("confirm", text, options)

        return new Promise<boolean>((resolve) => {
            resolveCallback = resolve
        })
    }

    return {
        open: dialogOpen,
        title: dialogTitle,
        message: dialogMessage,
        type: dialogType,
        okLabel: dialogOkLabel,
        cancelLabel: dialogCancelLabel,
        maxWidth: dialogMaxWidth,
        showAlert,
        showConfirm,
        close,
    }
}

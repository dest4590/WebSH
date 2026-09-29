<script lang="ts">
import { defineComponent } from "vue"

export default defineComponent({
    props: {
        modelValue: { type: Boolean, required: true },
        disabled: { type: Boolean, default: false },
        ariaLabel: { type: String, default: undefined },
    },
    emits: ["update:modelValue"],
    methods: {
        toggle() {
            if (this.disabled) return
            this.$emit("update:modelValue", !this.modelValue)
        },
    },
})
</script>

<template>
    <button
        type="button"
        role="switch"
        :aria-checked="modelValue"
        :aria-label="ariaLabel"
        :disabled="disabled"
        class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors"
        :class="[
            modelValue
                ? 'bg-white/20 border-white/30'
                : 'bg-transparent border-(--border-light)',
            disabled ? 'cursor-not-allowed opacity-50' : '',
        ]"
        @click="toggle"
    >
        <span
            class="inline-block h-3 w-3 rounded-full bg-text-secondary transition-transform mx-0.5"
            :class="
                modelValue
                    ? 'translate-x-4 bg-white'
                    : 'translate-x-1 bg-gray-100/30'
            "
        />
    </button>
</template>

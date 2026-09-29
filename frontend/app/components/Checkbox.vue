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
        role="checkbox"
        :aria-checked="modelValue"
        :aria-label="ariaLabel"
        :title="ariaLabel"
        :disabled="disabled"
        class="inline-flex items-center gap-2 leading-none align-middle"
        @click="toggle"
    >
        <span
            class="flex-none flex h-5 w-5 items-center justify-center rounded-sm border transition-colors"
            :class="[
                modelValue
                    ? 'bg-white/20 border-white/30'
                    : 'bg-transparent border-(--border-light) ',
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            ]"
        >
            <svg
                v-if="modelValue"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="none"
                class="h-3 w-3 text-white block"
                style="line-height: 0"
            >
                <path
                    d="M4 10l3 3 9-8"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        </span>
        <span class="align-middle leading-none"><slot /></span>
    </button>
</template>

<style scoped></style>

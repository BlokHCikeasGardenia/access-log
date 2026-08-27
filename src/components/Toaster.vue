<script setup lang="ts">
import { toasts, dismiss } from '@/lib/toast'
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80 max-w-[90vw]">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="rounded shadow-lg px-4 py-3 text-sm text-white cursor-pointer"
        :class="{
          'bg-emerald-600': t.kind === 'success',
          'bg-rose-600': t.kind === 'error',
          'bg-slate-700': t.kind === 'info',
        }"
        @click="dismiss(t.id)"
      >
        {{ t.message }}
      </div>
    </div>
  </Teleport>
</template>

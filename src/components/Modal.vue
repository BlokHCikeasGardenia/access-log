<script setup lang="ts">
const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div class="absolute inset-0 bg-black/40" @click="emit('close')" />
      <div class="relative bg-white rounded-none md:rounded-lg shadow-xl w-full max-w-full md:max-w-lg max-h-full md:max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 class="font-semibold text-slate-800">{{ props.title }}</h2>
          <button class="text-slate-400 hover:text-slate-700 text-xl leading-none p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center" @click="emit('close')">&times;</button>
        </div>
        <div class="px-5 py-4 overflow-auto flex-1">
          <slot />
        </div>
        <div v-if="$slots.footer" class="px-5 py-3 border-t border-slate-200 flex flex-col-reverse md:flex-row justify-end gap-2">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

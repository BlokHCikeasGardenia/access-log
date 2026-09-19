<script setup lang="ts">
// Placeholder skeleton sederhana untuk state loading di mobile & desktop,
// menggantikan teks "Memuat…" agar perubahan layout tidak melompat.
withDefaults(defineProps<{ rows?: number; card?: boolean }>(), { rows: 3, card: false })
</script>

<template>
  <div class="space-y-3" aria-hidden="true">
    <div v-for="i in rows" :key="i" class="bg-white rounded border border-slate-200 p-4 animate-pulse">
      <template v-if="card">
        <div class="flex items-center justify-between mb-3">
          <div class="h-4 bg-slate-200 rounded w-1/3"></div>
          <div class="h-5 bg-slate-200 rounded-full w-16"></div>
        </div>
        <div class="h-3 bg-slate-200 rounded w-2/3 mb-2"></div>
        <div class="h-3 bg-slate-200 rounded w-1/2"></div>
      </template>
      <template v-else>
        <div class="h-3 bg-slate-200 rounded w-1/4 mb-2"></div>
        <div class="h-4 bg-slate-200 rounded w-2/3"></div>
      </template>
    </div>
  </div>
</template>
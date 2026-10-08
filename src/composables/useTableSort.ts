import { computed, ref, type ComputedRef, type Ref } from 'vue'

export type SortOrder = 'asc' | 'desc' | 'none'

export interface UseTableSortReturn<T> {
  sortedData: ComputedRef<T[]>
  sortKey: Ref<string>
  sortOrder: Ref<SortOrder>
  toggleSort: (key: string) => void
  getSortIcon: (key: string) => string
}

function compareValues(a: unknown, b: unknown, order: SortOrder): number {
  if (a === b) return 0
  if (a === null || a === undefined) return order === 'asc' ? -1 : 1
  if (b === null || b === undefined) return order === 'asc' ? 1 : -1

  let result = 0

  if (typeof a === 'number' && typeof b === 'number') {
    result = a - b
  } else if (typeof a === 'string' && typeof b === 'string') {
    result = a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' })
  } else if (a instanceof Date && b instanceof Date) {
    result = a.getTime() - b.getTime()
  } else {
    result = String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' })
  }

  return order === 'asc' ? result : -result
}

export function useTableSort<T extends object>(
  data: Ref<T[]> | ComputedRef<T[]>,
  initialSortKey: string = '',
  initialSortOrder: SortOrder = 'none'
): UseTableSortReturn<T> {
  const sortKey = ref<string>(initialSortKey)
  const sortOrder = ref<SortOrder>(initialSortOrder)

  const sortedData = computed<T[]>(() => {
    if (!sortKey.value || sortOrder.value === 'none') {
      return data.value
    }

    return [...data.value].sort((a, b) => compareValues((a as Record<string, unknown>)[sortKey.value], (b as Record<string, unknown>)[sortKey.value], sortOrder.value))
  })

  function toggleSort(key: string) {
    if (sortKey.value === key) {
      if (sortOrder.value === 'asc') {
        sortOrder.value = 'desc'
      } else if (sortOrder.value === 'desc') {
        sortOrder.value = 'none'
        sortKey.value = ''
      }
    } else {
      sortKey.value = key
      sortOrder.value = 'asc'
    }
  }

  function getSortIcon(key: string): string {
    if (sortKey.value !== key || sortOrder.value === 'none') {
      return '⇅'
    }
    return sortOrder.value === 'asc' ? '▲' : '▼'
  }

  return {
    sortedData,
    sortKey,
    sortOrder,
    toggleSort,
    getSortIcon,
  }
}
import { reactive } from 'vue'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

export const toasts = reactive<Toast[]>([])
let counter = 0

export function notify(message: string, kind: ToastKind = 'info', timeout = 4000) {
  const id = ++counter
  toasts.push({ id, kind, message })
  if (timeout > 0) {
    setTimeout(() => dismiss(id), timeout)
  }
}

export function dismiss(id: number) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i !== -1) toasts.splice(i, 1)
}

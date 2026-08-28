'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Minimal toast system — enough for "action succeeded / failed" feedback. */

type ToastVariant = 'success' | 'error' | 'info'
type Toast = { id: number; title: string; description?: string; variant: ToastVariant }

type ToastContextValue = {
  toast: (input: { title: string; description?: string; variant?: ToastVariant }) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const nextId = React.useRef(1)

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback<ToastContextValue['toast']>(
    ({ title, description, variant = 'info' }) => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, title, description, variant }])
      setTimeout(() => dismiss(id), variant === 'error' ? 9000 : 5000)
    },
    [dismiss],
  )

  const value = React.useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border bg-background p-3 shadow-lg animate-in slide-in-from-bottom-2',
              t.variant === 'success' && 'border-emerald-500/40',
              t.variant === 'error' && 'border-destructive/50',
            )}
          >
            {t.variant === 'success' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
            {t.variant === 'error' && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />}
            {t.variant === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.description && <p className="mt-0.5 break-words text-xs text-muted-foreground">{t.description}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

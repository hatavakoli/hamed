import { cn } from '@/lib/utils'

/** Simple determinate bar. `value` is 0-100. */
export function Progress({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className={cn('h-full rounded-full bg-primary transition-all', barClassName)} style={{ width: `${clamped}%` }} />
    </div>
  )
}

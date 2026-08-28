import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva('relative w-full rounded-lg border p-4 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg~*]:pl-7', {
  variants: {
    variant: {
      default: 'bg-background text-foreground',
      destructive: 'border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300 [&>svg]:text-destructive dark:[&>svg]:text-red-300',
      warning: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-300',
      info: 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200 [&>svg]:text-sky-600 dark:[&>svg]:text-sky-300',
      success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-300',
    },
  },
  defaultVariants: { variant: 'default' },
})

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  ),
)
Alert.displayName = 'Alert'

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h5 ref={ref} className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />,
)
AlertTitle.displayName = 'AlertTitle'

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />,
)
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertTitle, AlertDescription }

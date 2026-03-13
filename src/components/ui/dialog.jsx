import React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOverlayLock } from '@/hooks/useOverlayLock'
import { Z_DIALOG_CONTENT, Z_DIALOG_OVERLAY } from '@/design/overlayZIndexTokens'

// Wrapper que adiciona infraestrutura global de overlay (classe + scroll lock)
const DialogRoot = ({ open, defaultOpen, onOpenChange, navMode = 'dim', children, ...props }) => {
  const [openState, setOpenState] = React.useState(!!(open ?? defaultOpen))

  React.useEffect(() => {
    if (open === undefined) return
    setOpenState(!!open)
  }, [open])

  useOverlayLock(!!openState, { navMode })

  const handleOpenChange = (next) => {
    setOpenState(!!next)
    onOpenChange?.(next)
  }

  return (
    <DialogPrimitive.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      {...props}
    >
      {children}
    </DialogPrimitive.Root>
  )
}

const Dialog = DialogRoot

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      `fixed inset-0 ${Z_DIALOG_OVERLAY} bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0`,
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef(
  ({ className, children, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          `fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] ${Z_DIALOG_CONTENT} w-[calc(100vw-1.5rem)] max-w-lg bg-background border border-border/60 shadow-2xl rounded-3xl overflow-hidden`,
          className
        )}
        style={{ maxHeight: '90vh' }}
        {...props}
      >
        <div
          className="overflow-y-auto"
          style={{
            maxHeight: '90vh',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          <div className="p-6 gap-4">{children}</div>
        </div>
        <DialogPrimitive.Close className="absolute right-3 top-3 sm:right-4 sm:top-4 z-20 h-10 w-10 rounded-full bg-background/70 backdrop-blur border border-border/60 text-foreground/80 transition-colors hover:bg-background/90 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
)
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}

import { AlertTriangle } from "lucide-react"
import { cn } from "../../utils/utils"
import { Button } from "./Button"

interface ConfirmDialogBodyProps {
  description: string
  onCancel: () => void
  onConfirm: () => void
  confirmText: string
  cancelText: string
  variant?: 'destructive' | 'default'
}

/**
 * The icon + description + cancel/confirm-button body shared by AlertDialog and by
 * Modal's internal "discard unsaved changes?" guard (FF-WEB-11). Kept dependency-free
 * (no Modal import) so Modal.tsx can render it directly without a circular import
 * (AlertDialog already builds on Modal).
 */
export function ConfirmDialogBody({
  description,
  onCancel,
  onConfirm,
  confirmText,
  cancelText,
  variant = 'default',
}: ConfirmDialogBodyProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className={cn(
          "p-2 rounded-full shrink-0",
          variant === 'destructive' ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
        )}>
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">
          {description}
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          {cancelText}
        </Button>
        <Button
          variant={variant === 'destructive' ? 'destructive' : 'default'}
          onClick={onConfirm}
        >
          {confirmText}
        </Button>
      </div>
    </div>
  )
}

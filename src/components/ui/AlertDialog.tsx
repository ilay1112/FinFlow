import { AlertTriangle } from "lucide-react"
import { cn } from "../../utils/utils"
import { Button } from "./Button"
import { Modal } from "./Modal"

interface AlertDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'destructive' | 'default'
}

export function AlertDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  description, 
  confirmText = "Confirm", 
  cancelText = "Cancel",
  variant = 'default'
}: AlertDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
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
          <Button variant="outline" onClick={onClose}>
            {cancelText}
          </Button>
          <Button 
            variant={variant === 'destructive' ? 'destructive' : 'default'} 
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

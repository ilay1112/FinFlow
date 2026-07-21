import { Modal } from "./Modal"
import { ConfirmDialogBody } from "./ConfirmDialogBody"

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
      <ConfirmDialogBody
        description={description}
        cancelText={cancelText}
        confirmText={confirmText}
        variant={variant}
        onCancel={onClose}
        onConfirm={() => {
          onConfirm();
          onClose();
        }}
      />
    </Modal>
  )
}

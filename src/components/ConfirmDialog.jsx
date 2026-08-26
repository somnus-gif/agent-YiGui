import Modal from './Modal'

// 确认对话框
export default function ConfirmDialog({ open, onClose, onConfirm, title = '确认操作', message, confirmText = '确认', cancelText = '取消', danger = true }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
      <div className="flex gap-2 mt-5 -mx-1">
        <button className="btn-ghost flex-1" onClick={onClose}>
          {cancelText}
        </button>
        <button
          className={danger ? 'btn-danger flex-1' : 'btn-primary flex-1'}
          onClick={() => {
            onConfirm?.()
            onClose()
          }}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}
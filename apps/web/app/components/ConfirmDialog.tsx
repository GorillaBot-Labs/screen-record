"use client";

import {
  Modal,
  modalButtonDanger,
  modalButtonSecondary,
} from "@/app/components/Modal";
import { AlertTriangle } from "lucide-react";
import { useCallback } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  detail,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  loadingLabel = "Deleting…",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const handleClose = useCallback(() => {
    if (loading) return;
    onCancel();
  }, [loading, onCancel]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      description={description}
      size="sm"
      closeOnBackdrop={!loading}
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className={modalButtonSecondary}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={modalButtonDanger}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
          aria-hidden
        >
          <AlertTriangle className="h-5 w-5" strokeWidth={2} />
        </div>
        {detail ? (
          <p
            className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground"
            title={detail}
          >
            {detail}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

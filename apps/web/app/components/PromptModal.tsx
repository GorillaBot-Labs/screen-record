"use client";

import {
  Modal,
  modalButtonPrimary,
  modalButtonSecondary,
  modalInputClass,
} from "@/app/components/Modal";
import { useCallback, useRef } from "react";

type PromptModalProps = {
  open: boolean;
  title: string;
  label: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function PromptModal({
  open,
  title,
  label,
  placeholder,
  confirmLabel = "Create",
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = new FormData(formRef.current!).get("name");
      if (typeof value !== "string" || !value.trim()) return;
      onConfirm(value.trim());
    },
    [onConfirm],
  );

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      initialFocusRef={inputRef}
      footer={
        <>
          <button type="button" onClick={onCancel} className={modalButtonSecondary}>
            Cancel
          </button>
          <button type="submit" form="prompt-modal-form" className={modalButtonPrimary}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <form ref={formRef} id="prompt-modal-form" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <input
            ref={inputRef}
            type="text"
            name="name"
            required
            maxLength={120}
            placeholder={placeholder}
            className={`mt-1.5 ${modalInputClass}`}
          />
        </label>
      </form>
    </Modal>
  );
}

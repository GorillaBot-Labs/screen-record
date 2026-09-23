"use client";

import {
  Modal,
  modalButtonDanger,
  modalButtonPrimary,
  modalButtonSecondary,
  modalInputClass,
} from "@/app/components/Modal";
import { useCallback, useEffect, useRef, useState } from "react";

type PromptModalProps = {
  open: boolean;
  title: string;
  label: string;
  description?: string;
  placeholder?: string;
  confirmLabel?: string;
  expectedValue?: string;
  destructive?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function PromptModal({
  open,
  title,
  label,
  description,
  placeholder,
  confirmLabel = "Create",
  expectedValue,
  destructive = false,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) setValue("");
  }, [open]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextValue = new FormData(formRef.current!).get("name");
      if (typeof nextValue !== "string" || !nextValue.trim()) return;
      if (expectedValue !== undefined && nextValue !== expectedValue) return;
      onConfirm(nextValue);
    },
    [expectedValue, onConfirm],
  );

  const confirmDisabled = expectedValue !== undefined && value !== expectedValue;
  const confirmClass = destructive ? modalButtonDanger : modalButtonPrimary;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      initialFocusRef={inputRef}
      footer={
        <>
          <button type="button" onClick={onCancel} className={modalButtonSecondary}>
            Cancel
          </button>
          <button
            type="submit"
            form="prompt-modal-form"
            disabled={confirmDisabled}
            className={confirmClass}
          >
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
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className={`mt-1.5 ${modalInputClass}`}
          />
        </label>
      </form>
    </Modal>
  );
}

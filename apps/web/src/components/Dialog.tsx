'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}

/** Native modal handles focus containment, restoration, and Escape dismissal. */
export function Dialog({ open, onClose, label, children, className = '' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={className}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

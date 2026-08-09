'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

/**
 * Minimal accessible modal built on the native `<dialog>` element, so focus
 * trapping, Escape-to-close and the top-layer backdrop come from the platform
 * rather than a hand-rolled implementation.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Fires on Escape as well as dialog.close(), so state stays in sync.
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="w-full max-w-2xl rounded-lg p-0 backdrop:bg-slate-900/40"
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
          Close
        </Button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="border-t border-slate-200 px-5 py-3">{footer}</div>}
    </dialog>
  );
}

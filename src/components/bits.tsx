import type { ReactNode } from "react";
import type { CaseState } from "../lib/types";
import { Chip } from "./ui";
import { IX } from "./icons";

export function CaseStateChip({ state }: { state: CaseState }) {
  if (state === "Active") return <Chip tone="mint">Active</Chip>;
  if (state === "Closed") return <Chip tone="sky">Booked</Chip>;
  return <Chip tone="coral">Lost</Chip>;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  tone = "danger",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "mint" | "primary";
}) {
  if (!open) return null;
  const cls = tone === "mint" ? "btn-mint" : tone === "primary" ? "btn-primary" : "btn-danger";
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 anim-fade-in"
      style={{ background: "rgba(4, 12, 15, 0.72)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="card anim-scale-in w-full max-w-[420px] p-5"
        style={{ background: "var(--raised)", boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-disp font-semibold text-[16px] m-0">{title}</h3>
          <button className="text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors" onClick={onClose} aria-label="Close">
            <IX size={17} />
          </button>
        </div>
        <div className="text-[13.5px] text-[var(--ink-dim)] mb-5">{body}</div>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${cls}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

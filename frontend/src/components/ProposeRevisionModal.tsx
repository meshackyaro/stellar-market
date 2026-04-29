"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";

export type ProposeRevisionMilestoneInput = {
  title: string;
  amount: number;
  deadline: string;
};

type Row = {
  key: string;
  title: string;
  amount: string;
  deadline: string;
};

function newRow(): Row {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: "",
    amount: "",
    deadline: "",
  };
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (milestones: ProposeRevisionMilestoneInput[]) => Promise<void>;
  initialRows: ProposeRevisionMilestoneInput[];
  processing: boolean;
};

export default function ProposeRevisionModal({
  isOpen,
  onClose,
  onSubmit,
  initialRows,
  processing,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialRows.length === 0) {
      setRows([newRow(), newRow()]);
      return;
    }
    setRows(
      initialRows.map((m, i) => ({
        key: `seed-${i}`,
        title: m.title,
        amount: String(m.amount),
        deadline: m.deadline.slice(0, 10),
      }))
    );
  }, [isOpen, initialRows]);

  const budgetTotal = useMemo(() => {
    return rows.reduce((sum, r) => {
      const n = parseFloat(r.amount);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [rows]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const milestones: ProposeRevisionMilestoneInput[] = [];
    for (const r of rows) {
      const title = r.title.trim();
      const amt = parseFloat(r.amount);
      if (!title || !Number.isFinite(amt) || amt <= 0 || !r.deadline) {
        return;
      }
      milestones.push({
        title,
        amount: amt,
        deadline: new Date(r.deadline + "T12:00:00.000Z").toISOString(),
      });
    }
    if (milestones.length === 0) return;
    await onSubmit(milestones);
  };

  const formValid =
    rows.length > 0 &&
    rows.every(
      (r) =>
        r.title.trim().length > 0 &&
        Number.isFinite(parseFloat(r.amount)) &&
        parseFloat(r.amount) > 0 &&
        !!r.deadline
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-theme-bg border border-theme-border rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <h2 className="text-lg font-semibold text-theme-heading">
            Propose revision
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-theme-text hover:bg-theme-border/30"
            disabled={processing}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-theme-text">
            Edit milestones and budget. The on-chain escrow will use the sum of
            milestone amounts as the new total if the other party accepts.
          </p>

          <div className="flex items-center justify-between text-sm">
            <span className="text-theme-text">Proposed budget (XLM)</span>
            <span className="font-semibold text-stellar-blue">
              {budgetTotal.toLocaleString(undefined, {
                maximumFractionDigits: 7,
              })}
            </span>
          </div>

          <div className="space-y-3">
            {rows.map((r, idx) => (
              <div
                key={r.key}
                className="p-3 rounded-lg border border-theme-border space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-theme-heading">
                    Milestone {idx + 1}
                  </span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRows((prev) => prev.filter((x) => x.key !== r.key))
                      }
                      className="text-theme-error hover:opacity-80 p-1"
                      disabled={processing}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Title"
                  className="w-full border border-theme-border rounded px-2 py-1.5 text-sm bg-theme-bg text-theme-text"
                  value={r.title}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((x) =>
                        x.key === r.key ? { ...x, title: e.target.value } : x
                      )
                    )
                  }
                  disabled={processing}
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.0000001"
                    placeholder="XLM"
                    className="flex-1 border border-theme-border rounded px-2 py-1.5 text-sm bg-theme-bg text-theme-text"
                    value={r.amount}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((x) =>
                          x.key === r.key ? { ...x, amount: e.target.value } : x
                        )
                      )
                    }
                    disabled={processing}
                  />
                  <input
                    type="date"
                    className="flex-1 border border-theme-border rounded px-2 py-1.5 text-sm bg-theme-bg text-theme-text"
                    value={r.deadline}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((x) =>
                          x.key === r.key
                            ? { ...x, deadline: e.target.value }
                            : x
                        )
                      )
                    }
                    disabled={processing}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, newRow()])}
            className="flex items-center gap-2 text-sm text-stellar-blue hover:underline"
            disabled={processing}
          >
            <Plus size={16} /> Add milestone
          </button>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-theme-border">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary py-2 px-4 text-sm"
            disabled={processing}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={processing || !formValid}
            className="btn-primary py-2 px-4 text-sm flex items-center gap-2"
          >
            {processing ? <Loader2 className="animate-spin" size={16} /> : null}
            Submit proposal
          </button>
        </div>
      </div>
    </div>
  );
}

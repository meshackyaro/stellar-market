"use client";

import { useState } from "react";
import { X, AlertCircle, Loader2 } from "lucide-react";
import axios, { AxiosError } from "axios";
import { useWallet } from "@/context/WalletContext";
import { Job } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type RaiseDisputeModalProps = {
  job: Job;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function RaiseDisputeModal({
  job,
  isOpen,
  onClose,
  onSuccess,
}: RaiseDisputeModalProps) {
  const { signAndBroadcastTransaction } = useWallet();
  const [reason, setReason] = useState("");
  const [minVotes, setMinVotes] = useState<number>(3);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonTouched, setReasonTouched] = useState(false);

  if (!isOpen) return null;

  // Check if escrow is funded
  const isEscrowFunded = job.escrowStatus === "FUNDED";

  const trimmedReason = reason.trim();
  const reasonError =
    trimmedReason.length === 0
      ? "Please describe the dispute reason."
      : trimmedReason.length < 20
        ? "Please describe the dispute in at least 20 characters."
        : null;
  const canSubmit = isEscrowFunded && !processing && !reasonError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReasonTouched(true);

    // Validate escrow status
    if (!isEscrowFunded) {
      setError("Escrow must be funded before a dispute can be raised.");
      return;
    }

    if (reasonError) {
      setError(reasonError);
      return;
    }

    if (reason.length > 2000) {
      setError(
        "Reason must not exceed 2000 characters. Please shorten your description.",
      );
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");

      // 1. Get XDR
      const res = await axios.post(
        `${API_URL}/disputes/init-raise`,
        { jobId: job.id, reason, minVotes },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      // 2. Sign & Broadcast
      const txResult = await signAndBroadcastTransaction(res.data.xdr);

      if (!txResult.success) {
        throw new Error(txResult.error || "Transaction failed");
      }

      // 3. Confirm
      await axios.post(
        `${API_URL}/disputes/confirm-tx`,
        {
          hash: txResult.hash,
          type: "RAISE_DISPUTE",
          jobId: job.id,
          onChainDisputeId: 1, // Simplified: production would parse from events
          respondentId: res.data.respondentId,
          reason,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const errorMsg =
        err instanceof AxiosError
          ? err.response?.data?.error
          : err instanceof Error
            ? err.message
            : "An error occurred";
      setError(errorMsg || "An error occurred");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-theme-bg border border-theme-border rounded-xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="flex justify-between items-center p-4 border-b border-theme-border">
          <h2 className="text-lg font-semibold text-theme-heading flex items-center gap-2">
            <AlertCircle className="text-theme-error" size={20} />
            Raise a Dispute
          </h2>
          <button
            onClick={onClose}
            className="text-theme-text hover:text-theme-heading p-1 rounded-full hover:bg-theme-border/50"
            disabled={processing}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 text-sm text-theme-error bg-theme-error/10 border border-theme-error/20 rounded-lg">
              {error}
            </div>
          )}

          {!isEscrowFunded && (
            <div className="p-3 text-sm text-theme-error bg-theme-error/10 border border-theme-error/20 rounded-lg">
              Escrow must be funded before a dispute can be raised. Current
              status: {job.escrowStatus}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-theme-heading mb-1">
              Reason for Dispute
            </label>
            <textarea
              className="input-field min-h-[100px] resize-y"
              placeholder="Explain clearly why you are initiating a dispute. Provide specific details about unfulfilled requirements or issues."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setReasonTouched(true)}
              disabled={processing}
              maxLength={2000}
              required
            />
            <div className="flex justify-between items-center mt-1">
              <p className="text-xs text-theme-text">
                This will be visible to community voters.
              </p>
              <span
                className={`text-xs tabular-nums ${
                  reason.length >= 2000
                    ? "text-theme-error font-semibold"
                    : "text-theme-text"
                }`}
              >
                {reason.length} / 2000
              </span>
            </div>
            {reason.length >= 2000 && (
              <p className="text-xs text-theme-error mt-1">
                Character limit reached. Please shorten your description.
              </p>
            )}
            {reasonTouched && reasonError && (
              <p className="text-xs text-theme-error mt-1">{reasonError}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-heading mb-1">
              Minimum Votes Required
            </label>
            <input
              type="number"
              min={3}
              max={21}
              className="input-field"
              value={minVotes}
              onChange={(e) => setMinVotes(parseInt(e.target.value))}
              disabled={processing}
              required
            />
            <p className="text-xs text-theme-text mt-1">
              The dispute automatically resolves when this many votes are cast.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={processing}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary flex-1 bg-theme-error hover:bg-theme-error/90 border border-transparent text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? (
                <span className="flex items-center gap-2 justify-center">
                  <Loader2 className="animate-spin" size={16} /> Submitting...
                </span>
              ) : (
                "Raise Dispute"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

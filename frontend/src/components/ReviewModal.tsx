"use client";

import { useState } from "react";
import { X, Star, Loader2 } from "lucide-react";
import axios, { AxiosError } from "axios";
import { Job } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

type ReviewModalProps = {
  job: Job;
  revieweeId: string;
  revieweeName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function ReviewModal({
  job,
  revieweeId,
  revieweeName,
  isOpen,
  onClose,
  onSuccess,
}: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      setError("Please select a rating");
      return;
    }

    if (comment.length < 10) {
      setError(
        "Please provide a more detailed review (at least 10 characters)",
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_URL}/reviews`,
        {
          jobId: job.id,
          revieweeId,
          rating,
          comment,
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
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-theme-bg border border-theme-border rounded-xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="flex justify-between items-center p-4 border-b border-theme-border">
          <h2 className="text-lg font-semibold text-theme-heading">
            Leave a Review
          </h2>
          <button
            onClick={onClose}
            className="text-theme-text hover:text-theme-heading p-1 rounded-full hover:bg-theme-border/50"
            disabled={submitting}
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

          <div>
            <p className="text-sm text-theme-text mb-3">
              How was your experience working with{" "}
              <span className="font-medium text-theme-heading">
                {revieweeName}
              </span>{" "}
              on{" "}
              <span className="font-medium text-theme-heading">
                {job.title}
              </span>
              ?
            </p>

            <div className="flex items-center justify-center gap-2 py-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110"
                  disabled={submitting}
                >
                  <Star
                    size={32}
                    className={
                      star <= (hoveredRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-theme-border"
                    }
                  />
                </button>
              ))}
            </div>

            {rating > 0 && (
              <p className="text-center text-sm text-theme-text">
                {rating === 1 && "Poor"}
                {rating === 2 && "Fair"}
                {rating === 3 && "Good"}
                {rating === 4 && "Very Good"}
                {rating === 5 && "Excellent"}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-heading mb-1">
              Your Review
            </label>
            <textarea
              className="input-field min-h-[100px] resize-y"
              placeholder="Share your experience working on this job..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting}
              required
            />
            <p className="text-xs text-theme-text mt-1">
              Minimum 10 characters
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleSkip}
              disabled={submitting}
              className="btn-secondary flex-1"
            >
              Skip for Now
            </button>
            <button
              type="submit"
              disabled={submitting || rating === 0}
              className="btn-primary flex-1"
            >
              {submitting ? (
                <span className="flex items-center gap-2 justify-center">
                  <Loader2 className="animate-spin" size={16} /> Submitting...
                </span>
              ) : (
                "Submit Review"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

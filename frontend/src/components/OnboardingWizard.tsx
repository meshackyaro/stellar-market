"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, Briefcase, Search, User, CheckCircle2, Loader2 } from "lucide-react";
import axios from "axios";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
const TOTAL_STEPS = 3;

interface StepProps {
  onNext: () => void;
  onSkip: () => void;
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
            i < step ? "bg-stellar-blue" : "bg-theme-border"
          }`}
        />
      ))}
      <span className="text-xs text-theme-text ml-1 shrink-0">
        {step}/{TOTAL_STEPS}
      </span>
    </div>
  );
}

function StepOne({ onNext, onSkip, role }: StepProps & { role: string }) {
  return (
    <div>
      <div className="w-12 h-12 rounded-full bg-stellar-blue/10 flex items-center justify-center mb-4">
        <User size={24} className="text-stellar-blue" />
      </div>
      <h2 className="text-xl font-bold text-theme-heading mb-2">Welcome to StellarMarket!</h2>
      <p className="text-theme-text text-sm mb-6">
        You&apos;re registered as a{" "}
        <span className="font-semibold text-stellar-blue capitalize">{role.toLowerCase()}</span>.
        Let&apos;s get you set up in just a few steps.
      </p>
      <div className="flex gap-3">
        <button onClick={onNext} className="btn-primary flex items-center gap-2">
          Get Started <ChevronRight size={16} />
        </button>
        <button onClick={onSkip} className="btn-secondary text-sm">
          Skip
        </button>
      </div>
    </div>
  );
}

function StepTwo({
  onNext,
  onSkip,
  bio,
  setBio,
  skills,
  toggleSkill,
  isSaving,
}: StepProps & {
  bio: string;
  setBio: (v: string) => void;
  skills: string[];
  toggleSkill: (s: string) => void;
  isSaving: boolean;
}) {
  const SUGGESTED = ["React", "Next.js", "TypeScript", "Node.js", "Rust", "Soroban", "Stellar", "Figma", "Python", "Solidity"];

  return (
    <div>
      <div className="w-12 h-12 rounded-full bg-stellar-purple/10 flex items-center justify-center mb-4">
        <User size={24} className="text-stellar-purple" />
      </div>
      <h2 className="text-xl font-bold text-theme-heading mb-1">Complete your profile</h2>
      <p className="text-theme-text text-sm mb-5">A filled-out profile gets you noticed faster.</p>

      <div className="mb-4">
        <label className="block text-sm font-medium text-theme-text mb-1">Bio</label>
        <textarea
          className="input-field resize-none h-20 text-sm"
          placeholder="Tell clients or freelancers a bit about yourself…"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
        />
        <p className="text-xs text-theme-text/60 mt-1 text-right">{bio.length}/500</p>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-theme-text mb-2">Skills</label>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSkill(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                skills.includes(s)
                  ? "bg-stellar-blue text-white"
                  : "bg-theme-card border border-theme-border text-theme-text hover:border-stellar-blue"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onNext}
          disabled={isSaving}
          className="btn-primary flex items-center gap-2 disabled:opacity-60"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
          Save &amp; Continue <ChevronRight size={16} />
        </button>
        <button onClick={onSkip} className="btn-secondary text-sm">
          Skip
        </button>
      </div>
    </div>
  );
}

function StepThree({ onSkip, role }: { onSkip: () => void; role: string }) {
  const isClient = role === "CLIENT";
  return (
    <div>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${isClient ? "bg-green-500/10" : "bg-stellar-blue/10"}`}>
        {isClient ? (
          <Briefcase size={24} className="text-green-400" />
        ) : (
          <Search size={24} className="text-stellar-blue" />
        )}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 size={20} className="text-green-400" />
        <h2 className="text-xl font-bold text-theme-heading">You&apos;re all set!</h2>
      </div>
      <p className="text-theme-text text-sm mb-6">
        {isClient
          ? "Start by posting your first job and find skilled freelancers on Stellar."
          : "Browse open jobs and apply to ones that match your skills."}
      </p>
      <div className="flex gap-3">
        <Link
          href={isClient ? "/post-job" : "/jobs"}
          className="btn-primary flex items-center gap-2"
          onClick={onSkip}
        >
          {isClient ? <Briefcase size={16} /> : <Search size={16} />}
          {isClient ? "Post a Job" : "Browse Jobs"}
        </Link>
        <button onClick={onSkip} className="btn-secondary text-sm">
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

export default function OnboardingWizard() {
  const { user, token, updateUser } = useAuth();
  const [step, setStep] = useState(1);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [skills, setSkills] = useState<string[]>(user?.skills ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user && user.completedOnboarding === false) {
      setOpen(true);
    }
  }, [user]);

  const markComplete = useCallback(async () => {
    try {
      await axios.patch(
        `${API}/users/me/onboarding`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      updateUser({ completedOnboarding: true });
    } catch {
      // silently ignore — wizard will not reappear after page refresh
      // since the optimistic updateUser already hid it
    }
  }, [token, updateUser]);

  const handleSkip = useCallback(async () => {
    setOpen(false);
    await markComplete();
  }, [markComplete]);

  const handleStepOneNext = () => setStep(2);

  const handleStepTwoNext = async () => {
    setIsSaving(true);
    try {
      await axios.put(
        `${API}/users/me`,
        { bio, skills },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      updateUser({ bio, skills });
    } catch {
      // profile save failure is non-blocking — still advance
    } finally {
      setIsSaving(false);
      setStep(3);
    }
  };

  const toggleSkill = (skill: string) => {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  };

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-theme-card border border-theme-border rounded-2xl shadow-2xl w-full max-w-md p-6 relative animate-in fade-in slide-in-from-bottom-4">
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-1.5 text-theme-text hover:text-theme-heading transition-colors"
          aria-label="Close onboarding"
        >
          <X size={18} />
        </button>

        <ProgressBar step={step} />

        {step === 1 && (
          <StepOne onNext={handleStepOneNext} onSkip={handleSkip} role={user.role} />
        )}
        {step === 2 && (
          <StepTwo
            onNext={handleStepTwoNext}
            onSkip={handleSkip}
            bio={bio}
            setBio={setBio}
            skills={skills}
            toggleSkill={toggleSkill}
            isSaving={isSaving}
          />
        )}
        {step === 3 && <StepThree onSkip={handleSkip} role={user.role} />}
      </div>
    </div>
  );
}

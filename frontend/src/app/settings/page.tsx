"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { User, Settings, Mail, FileText, Link as LinkIcon, Loader2, ShieldCheck, ShieldOff, Copy, Check, Upload, X, Plus } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface FormErrors {
  username?: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
  skills?: string;
  general?: string;
}

export default function SettingsPage() {
  const { user, token, isLoading: authLoading, updateUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // Seed form fields immediately from auth-context user so the form is never
  // blank while the fresh API fetch is in-flight (or if it fails).
  const [username, setUsername] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [role, setRole] = useState<"CLIENT" | "FREELANCER">(user?.role ?? "FREELANCER");
  const [skills, setSkills] = useState<string[]>(user?.skills ?? []);
  const [newSkill, setNewSkill] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  // Only show the full-page loader when there is no cached data to show yet.
  const [isPageLoading, setIsPageLoading] = useState(!user);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // ─── 2FA State ──────────────────────────────────────────────────────────────
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFASetupData, setTwoFASetupData] = useState<{
    qrCode: string;
    secret: string;
  } | null>(null);
  /** Shown once after enable or regenerate; plain codes only exist in memory until dismissed. */
  const [recoveryCodesPending, setRecoveryCodesPending] = useState<string[] | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerateTotp, setRegenerateTotp] = useState("");
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [copiedRecovery, setCopiedRecovery] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !token) {
      router.push("/");
    }
  }, [authLoading, token, router]);

  // Fetch the latest profile from the API and overwrite local state so any
  // server-side changes (e.g. from another device) are reflected immediately.
  useEffect(() => {
    if (!token) return;

    async function fetchProfile() {
      try {
        const res = await axios.get(`${API_URL}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.data;
        // Always overwrite with fresh server values.
        setUsername(data.username ?? "");
        setEmail(data.email ?? "");
        setBio(data.bio ?? "");
        setAvatarUrl(data.avatarUrl ?? "");
        setRole(data.role ?? "FREELANCER");
        setSkills(data.skills ?? []);
        setTwoFAEnabled(data.twoFactorEnabled ?? false);
      } catch {
        // If the fetch fails we still have the context values pre-filled —
        // only show an error if there was nothing pre-loaded at all.
        if (!user) {
          toast.error("Failed to load profile data.");
        }
      } finally {
        setIsPageLoading(false);
      }
    }

    fetchProfile();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Client-side validation
  function validate(): boolean {
    const newErrors: FormErrors = {};

    if (!username || username.length < 3) {
      newErrors.username = "Username must be at least 3 characters.";
    } else if (username.length > 30) {
      newErrors.username = "Username must be at most 30 characters.";
    } else if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      newErrors.username = "Username can only contain letters, numbers, hyphens, and underscores.";
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Please enter a valid email address.";
    }

    if (bio && bio.length > 500) {
      newErrors.bio = "Bio must be at most 500 characters.";
    }

    if (avatarUrl && !/^https?:\/\/.+/.test(avatarUrl)) {
      newErrors.avatarUrl = "Please enter a valid URL.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleAvatarUpload() {
    if (!avatarFile || !token) return;

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', avatarFile);

      const res = await axios.post(`${API_URL}/users/me/avatar`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      setAvatarUrl(res.data.avatarUrl);
      updateUser({ avatarUrl: res.data.avatarUrl });
      setAvatarFile(null);
      setAvatarPreview("");
      toast.success('Avatar uploaded successfully!');
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const message = error.response?.data?.error || 'Failed to upload avatar';
      toast.error(message);
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  function addSkill() {
    const trimmed = newSkill.trim();
    if (!trimmed) return;
    
    if (skills.includes(trimmed)) {
      toast.error('Skill already added');
      return;
    }

    if (skills.length >= 20) {
      toast.error('Maximum 20 skills allowed');
      return;
    }

    setSkills([...skills, trimmed]);
    setNewSkill("");
  }

  function removeSkill(skill: string) {
    setSkills(skills.filter(s => s !== skill));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    setErrors({});

    try {
      const payload: Record<string, any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
        username,
        role,
        skills,
      };
      if (email) payload.email = email;
      else payload.email = null;
      if (bio) payload.bio = bio;
      else payload.bio = null;
      if (avatarUrl) payload.avatarUrl = avatarUrl;
      else payload.avatarUrl = null;

      const res = await axios.put(`${API_URL}/users/me`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      updateUser(res.data);
      toast.success("Profile updated successfully!");
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const message =
        error.response?.data?.error || "Failed to update profile. Please try again.";
      setErrors({ general: message });
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  if (authLoading || isPageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-stellar-blue" />
      </div>
    );
  }

  async function handleSetup2FA() {
    setTwoFALoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/2fa/setup`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTwoFASetupData(res.data);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(error.response?.data?.error || "Failed to setup 2FA.");
    } finally {
      setTwoFALoading(false);
    }
  }

  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault();
    setTwoFALoading(true);
    try {
      await axios.post(`${API_URL}/auth/2fa/verify`, { code: verifyCode }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTwoFAEnabled(true);
      setTwoFASetupData(null);
      setVerifyCode("");
      toast.success("2FA has been enabled successfully!");
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(error.response?.data?.error || "Invalid verification code.");
    } finally {
      setTwoFALoading(false);
    }
  }

  async function handleDisable2FA(e: React.FormEvent) {
    e.preventDefault();
    setTwoFALoading(true);
    try {
      await axios.post(`${API_URL}/auth/2fa/disable`, { password: disablePassword }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTwoFAEnabled(false);
      setShowDisableModal(false);
      setDisablePassword("");
      toast.success("2FA has been disabled.");
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(error.response?.data?.error || "Failed to disable 2FA.");
    } finally {
      setTwoFALoading(false);
    }
  }

  function copyRecoveryCodes() {
    if (recoveryCodesPending?.length) {
      navigator.clipboard.writeText(recoveryCodesPending.join("\n"));
      setCopiedRecovery(true);
      setTimeout(() => setCopiedRecovery(false), 2000);
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Settings size={28} className="text-stellar-blue" />
          <h1 className="text-3xl font-bold text-theme-heading">Settings</h1>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-6">
          <h2 className="text-xl font-semibold text-theme-heading">Edit Profile</h2>

          {errors.general && (
            <div className="bg-theme-error/10 border border-theme-error/20 text-theme-error rounded-lg px-4 py-3 text-sm">
              {errors.general}
            </div>
          )}

          {/* Username */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-theme-heading mb-2">
              <span className="flex items-center gap-2">
                <User size={14} />
                Username
              </span>
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              placeholder="Your username"
              aria-describedby={errors.username ? "username-error" : undefined}
            />
            {errors.username && (
              <p id="username-error" className="text-theme-error text-xs mt-1">
                {errors.username}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-theme-heading mb-2">
              <span className="flex items-center gap-2">
                <Mail size={14} />
                Email
              </span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="your@email.com"
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && (
              <p id="email-error" className="text-theme-error text-xs mt-1">
                {errors.email}
              </p>
            )}
          </div>

          {/* Bio */}
          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-theme-heading mb-2">
              <span className="flex items-center gap-2">
                <FileText size={14} />
                Bio
              </span>
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="input-field min-h-[120px] resize-y"
              placeholder="Tell us about yourself..."
              maxLength={500}
              aria-describedby={errors.bio ? "bio-error" : "bio-count"}
            />
            <div className="flex justify-between mt-1">
              {errors.bio ? (
                <p id="bio-error" className="text-theme-error text-xs">
                  {errors.bio}
                </p>
              ) : (
                <span />
              )}
              <span id="bio-count" className="text-theme-text text-xs">
                {bio.length}/500
              </span>
            </div>
          </div>

          {/* Avatar URL */}
          <div>
            <label htmlFor="avatarUrl" className="block text-sm font-medium text-theme-heading mb-2">
              <span className="flex items-center gap-2">
                <LinkIcon size={14} />
                Avatar URL
              </span>
            </label>
            <input
              id="avatarUrl"
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="input-field"
              placeholder="https://example.com/avatar.png"
              aria-describedby={errors.avatarUrl ? "avatar-error" : undefined}
            />
            {errors.avatarUrl && (
              <p id="avatar-error" className="text-theme-error text-xs mt-1">
                {errors.avatarUrl}
              </p>
            )}
            {avatarUrl && !errors.avatarUrl && (
              <div className="mt-3 flex items-center gap-3">
                <Image
                  src={avatarUrl}
                  alt="Avatar preview"
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full object-cover border border-theme-border"
                  unoptimized
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <span className="text-theme-text text-xs">Preview</span>
              </div>
            )}
          </div>

          {/* Avatar Upload */}
          <div>
            <label className="block text-sm font-medium text-theme-heading mb-2">
              <span className="flex items-center gap-2">
                <Upload size={14} />
                Upload Avatar
              </span>
            </label>
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarFileChange}
                className="hidden"
                id="avatar-upload"
              />
              <label
                htmlFor="avatar-upload"
                className="btn-secondary cursor-pointer flex items-center gap-2 text-sm"
              >
                <Upload size={16} />
                Choose File
              </label>
              {avatarFile && (
                <button
                  type="button"
                  onClick={handleAvatarUpload}
                  disabled={isUploadingAvatar}
                  className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  {isUploadingAvatar ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      Upload
                    </>
                  )}
                </button>
              )}
            </div>
            {avatarPreview && (
              <div className="mt-3 flex items-center gap-3">
                <Image
                  src={avatarPreview}
                  alt="Avatar preview"
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full object-cover border border-theme-border"
                  unoptimized
                />
                <span className="text-theme-text text-xs">Preview</span>
              </div>
            )}
            <p className="text-theme-text text-xs mt-2">
              Max file size: 5MB. Supported formats: JPG, PNG, GIF
            </p>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-sm font-medium text-theme-heading mb-2">
              Skills
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                className="input-field flex-1"
                placeholder="Add a skill (e.g., React, Node.js)"
                maxLength={50}
              />
              <button
                type="button"
                onClick={addSkill}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <Plus size={16} />
                Add
              </button>
            </div>
            {skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1.5 bg-theme-card border border-theme-border rounded-full text-sm text-theme-text flex items-center gap-2"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      className="text-theme-error hover:text-theme-error/80"
                      aria-label={`Remove ${skill}`}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-theme-text text-sm">No skills added yet</p>
            )}
            {errors.skills && (
              <p className="text-theme-error text-xs mt-1">{errors.skills}</p>
            )}
          </div>

          {/* Role Toggle */}
          <div>
            <label className="block text-sm font-medium text-theme-heading mb-3">
              Role
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRole("CLIENT")}
                className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${role === "CLIENT"
                    ? "bg-stellar-blue/20 border-stellar-blue text-stellar-blue"
                    : "bg-theme-card border-theme-border text-theme-text hover:border-theme-text"
                  }`}
                aria-pressed={role === "CLIENT"}
              >
                Client
              </button>
              <button
                type="button"
                onClick={() => setRole("FREELANCER")}
                className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${role === "FREELANCER"
                    ? "bg-stellar-purple/20 border-stellar-purple text-stellar-purple"
                    : "bg-theme-card border-theme-border text-theme-text hover:border-theme-text"
                  }`}
                aria-pressed={role === "FREELANCER"}
              >
                Freelancer
              </button>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>

        {/* Security — Two-Factor Authentication */}
        <div className="card space-y-6 mt-8">
          <h2 className="text-xl font-semibold text-dark-heading flex items-center gap-2">
            <ShieldCheck size={20} />
            Security
          </h2>

          {recoveryCodesPending && recoveryCodesPending.length > 0 ? (
            <div className="space-y-4 rounded-lg border border-amber-600/40 bg-amber-950/30 p-4">
              <p className="text-amber-200 text-sm font-medium">
                Save these recovery codes now. Each code works once instead of your authenticator at login. They will not be shown again.
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-dark-muted text-xs">Recovery codes</p>
                <button
                  type="button"
                  onClick={copyRecoveryCodes}
                  className="flex items-center gap-1 text-xs text-stellar-blue hover:underline shrink-0"
                >
                  {copiedRecovery ? <Check size={12} /> : <Copy size={12} />}
                  {copiedRecovery ? "Copied!" : "Copy all"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {recoveryCodesPending.map((code, i) => (
                  <code
                    key={i}
                    className="block p-2 bg-dark-bg border border-dark-border rounded text-center text-sm text-dark-text font-mono"
                  >
                    {code}
                  </code>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRecoveryCodesPending(null)}
                className="btn-primary text-sm"
              >
                I have stored my recovery codes safely
              </button>
            </div>
          ) : twoFAEnabled && !twoFASetupData ? (
            /* 2FA is ON */
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-900/20 border border-green-700/30 rounded-lg">
                <ShieldCheck size={20} className="text-green-400" />
                <p className="text-green-300 text-sm">Two-factor authentication is enabled.</p>
              </div>

              {showRegenerateModal ? (
                <form onSubmit={handleRegenerateRecovery} className="space-y-3 rounded-lg border border-dark-border p-4">
                  <p className="text-dark-muted text-sm">
                    Enter a 6-digit code from your authenticator. This replaces all existing recovery codes.
                  </p>
                  <input
                    type="text"
                    value={regenerateTotp}
                    onChange={(e) => setRegenerateTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="input-field text-center tracking-widest"
                    placeholder="000000"
                    maxLength={6}
                    required
                    autoComplete="one-time-code"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={twoFALoading || regenerateTotp.length !== 6}
                      className="flex items-center gap-2 px-4 py-2 bg-stellar-blue hover:bg-stellar-blue/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {twoFALoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      Generate new codes
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowRegenerateModal(false); setRegenerateTotp(""); }}
                      className="px-4 py-2 border border-dark-border text-dark-text rounded-lg text-sm hover:bg-dark-bg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : showDisableModal ? (
                <form onSubmit={handleDisable2FA} className="space-y-3">
                  <p className="text-dark-muted text-sm">Enter your password to disable 2FA:</p>
                  <input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    className="input-field"
                    placeholder="Your password"
                    required
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={twoFALoading}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {twoFALoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                      Confirm Disable
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowDisableModal(false); setDisablePassword(""); }}
                      className="px-4 py-2 border border-dark-border text-dark-text rounded-lg text-sm hover:bg-dark-bg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRegenerateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-stellar-blue/50 text-stellar-blue rounded-lg text-sm hover:bg-stellar-blue/10 transition-colors"
                  >
                    <ShieldCheck size={14} />
                    Regenerate recovery codes
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDisableModal(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-red-600/50 text-red-400 rounded-lg text-sm hover:bg-red-900/20 transition-colors"
                  >
                    <ShieldOff size={14} />
                    Disable 2FA
                  </button>
                </div>
              )}
            </div>
          ) : twoFASetupData ? (
            /* Setup in progress */
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-dark-muted text-sm mb-4">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                <img
                  src={twoFASetupData.qrCode}
                  alt="2FA QR Code"
                  className="mx-auto w-48 h-48 rounded-lg border border-dark-border"
                />
              </div>

              <div>
                <p className="text-dark-muted text-xs mb-1">Manual entry key:</p>
                <code className="block p-2 bg-dark-bg border border-dark-border rounded text-sm text-dark-text break-all">
                  {twoFASetupData.secret}
                </code>
              </div>

              <p className="text-dark-muted text-xs">
                After you verify with a 6-digit app code, you will receive one-time recovery codes to download or copy. Store them offline.
              </p>

              <form onSubmit={handleVerify2FA} className="space-y-3">
                <label className="block text-sm font-medium text-dark-heading">
                  Enter a code from your authenticator app to verify:
                </label>
                <input
                  type="text"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  className="input-field text-center tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  required
                  autoComplete="one-time-code"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={twoFALoading || verifyCode.length !== 6}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {twoFALoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    Verify &amp; Enable
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTwoFASetupData(null); setVerifyCode(""); }}
                    className="px-4 py-2 border border-dark-border text-dark-text rounded-lg text-sm hover:bg-dark-bg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* 2FA is OFF */
            <div className="space-y-4">
              <p className="text-dark-muted text-sm">
                Add an extra layer of security to your account by enabling two-factor authentication with an authenticator app.
              </p>
              <button
                onClick={handleSetup2FA}
                disabled={twoFALoading}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {twoFALoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                Enable 2FA
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

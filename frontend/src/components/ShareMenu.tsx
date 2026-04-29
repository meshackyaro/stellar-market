"use client";

import { Share2, Link, Twitter, Linkedin, Send, Copy, Check } from "lucide-react";
import { useState } from "react";

interface ShareMenuProps {
  title: string;
  url: string;
  description?: string;
}

export default function ShareMenu({ title, url, description = "" }: ShareMenuProps) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const shareData = {
    title,
    text: description,
    url,
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      setIsOpen(!isOpen);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const shareLinks = [
    {
      name: "X (Twitter)",
      icon: <Twitter size={18} />,
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
      color: "hover:text-black dark:hover:text-white",
    },
    {
      name: "LinkedIn",
      icon: <Linkedin size={18} />,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      color: "hover:text-[#0A66C2]",
    },
    {
      name: "Telegram",
      icon: <Send size={18} />,
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      color: "hover:text-[#0088cc]",
    },
  ];

  return (
    <div className="relative">
      <button
        onClick={handleNativeShare}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-theme-text hover:text-theme-heading bg-theme-bg border border-theme-border rounded-lg transition-colors"
        title="Share"
      >
        <Share2 size={18} />
        <span className="hidden sm:inline">Share</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-56 bg-theme-card border border-theme-border rounded-xl shadow-xl z-50 py-2 animate-slide-in">
            <button
              onClick={copyToClipboard}
              className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-theme-text hover:bg-theme-border/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Link size={18} />
                <span>Copy Link</span>
              </div>
              {copied ? (
                <Check size={16} className="text-green-500" />
              ) : (
                <Copy size={16} className="text-theme-text/50" />
              )}
            </button>

            <div className="h-px bg-theme-border my-1" />

            {shareLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-theme-text hover:bg-theme-border/20 transition-colors ${link.color}`}
              >
                {link.icon}
                <span>Share on {link.name}</span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

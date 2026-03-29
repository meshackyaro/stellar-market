"use client";

import Link from "next/link";
import Image from "next/image";
import {
  Menu,
  X,
  MessageSquare,
  Briefcase,
  LayoutDashboard,
  PenLine,
  LogOut,
  User as UserIcon,
  Users,
  Settings,
  Search,
  ShieldCheck,
} from "lucide-react";
import axios from "axios";
import { useState, useRef, useEffect } from "react";
import { useWallet } from "@/context/WalletContext";
import { useSocket } from "@/context/SocketContext";
import { useAuth } from "@/context/AuthContext";
import ThemeToggleButton from "./ThemeToggleButton";
import NotificationBell from "./NotificationBell";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

function UserMenu({ className }: { className?: string }) {
  const { disconnect } = useWallet();
  const { user, logout, isLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLoading) {
    return (
      <div
        className={`h-10 w-32 bg-theme-border/50 animate-pulse rounded-lg ${className ?? ""}`}
      />
    );
  }

  if (user) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border border-theme-border hover:bg-theme-border/50 transition-colors ${className ?? ""}`}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple flex items-center justify-center text-white font-bold text-sm">
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={user.username}
                width={32}
                height={32}
                className="w-full h-full rounded-full object-cover"
                unoptimized
              />
            ) : (
              user.username.charAt(0).toUpperCase()
            )}
          </div>
          <div className="text-left hidden lg:block">
            <p className="text-sm font-medium text-theme-heading leading-tight">
              {user.username}
            </p>
            <p className="text-xs text-theme-text leading-tight">{user.role}</p>
          </div>
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-theme-card border border-theme-border rounded-xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
            <div className="px-4 py-3 border-b border-theme-border mb-1">
              <p className="text-sm font-medium text-theme-heading">
                {user.username}
              </p>
              <p className="text-xs text-theme-text break-all">
                {user.walletAddress}
              </p>
            </div>
            <Link
              href={`/profile/${user.id}`}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-theme-text hover:bg-theme-border/50 transition-colors"
            >
              <UserIcon size={16} />
              Your Profile
            </Link>
            <Link
              href="/dashboard"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-theme-text hover:bg-theme-border/50 transition-colors"
            >
              <LayoutDashboard size={16} />
              Dashboard
            </Link>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-theme-text hover:bg-theme-border/50 transition-colors"
            >
              <Settings size={16} />
              Settings
            </Link>
            <button
              onClick={() => {
                logout();
                disconnect();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-theme-error hover:bg-theme-error/10 transition-colors text-left"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/auth/login"
        className="text-sm font-medium text-theme-text hover:text-theme-heading transition-colors"
      >
        Log In
      </Link>
      <Link href="/auth/register" className="btn-primary text-sm py-2 px-4">
        Sign Up
      </Link>
    </div>
  );
}

/** Real-time unread badge powered by Socket.io + initial REST count */
function UnreadBadge() {
  const { socket } = useSocket();
  const { token } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!token) return;

    axios
      .get<{ count: number }>(`${API}/messages/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setCount(res.data.count))
      .catch(() => {
        /* silently ignore */
      });
  }, [token]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = () => setCount((c) => c + 1);
    const handleMessagesRead = () => setCount(0);

    socket.on("new_message", handleNewMessage);
    socket.on("messages_read", handleMessagesRead);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("messages_read", handleMessagesRead);
    };
  }, [socket]);

  if (count === 0) return null;

  return (
    <span
      id="unread-badge"
      data-testid="unread-badge"
      className="absolute -top-1.5 -right-2.5 bg-stellar-blue text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-lg border border-theme-bg animate-pulse"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const isClient = user?.role === "CLIENT";
  const isFreelancer = user?.role === "FREELANCER";

  return (
    <nav className="border-b border-theme-border bg-theme-bg/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-stellar-blue to-stellar-purple rounded-lg group-hover:scale-110 transition-transform" />
            <span className="text-xl font-bold text-theme-heading">
              StellarMarket
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            {/* Freelancers and unauthenticated users see the job browsing link */}
            {!isClient && (
              <Link
                href="/jobs"
                className="text-theme-text hover:text-theme-heading transition-colors flex items-center gap-2"
              >
                <Briefcase size={16} />
                {isFreelancer ? "Find Work" : "Jobs"}
              </Link>
            )}
            <Link
              href="/services"
              className="text-theme-text hover:text-theme-heading transition-colors flex items-center gap-2"
            >
              <Search size={16} />
              Services
            </Link>
            <Link
              href="/freelancers"
              className="text-theme-text hover:text-theme-heading transition-colors flex items-center gap-2"
            >
              <Users size={16} />
              Talent
            </Link>
            <Link
              href="/disputes"
              className="text-theme-text hover:text-theme-heading transition-colors flex items-center gap-2"
            >
              <ShieldCheck size={16} />
              Disputes
            </Link>
            <Link
              href="/dashboard"
              className="text-theme-text hover:text-theme-heading transition-colors flex items-center gap-2"
            >
              <LayoutDashboard size={16} />
              Dashboard
            </Link>
            <Link
              href="/messages"
              id="messages-nav-link"
              className="relative text-theme-text hover:text-theme-heading transition-colors flex items-center gap-2"
            >
              <MessageSquare size={16} />
              Messages
              <UnreadBadge />
            </Link>
            {/* Only clients see Post a Job */}
            {isClient && (
              <Link
                href="/post-job"
                className="text-theme-text hover:text-theme-heading transition-colors flex items-center gap-2"
              >
                <PenLine size={16} />
                Post a Job
              </Link>
            )}
            <NotificationBell />
            <ThemeToggleButton />
            <UserMenu />
          </div>

          <button
            className="md:hidden text-theme-text"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden pb-4 flex flex-col gap-4">
            {!isClient && (
              <Link
                href="/jobs"
                className="text-theme-text hover:text-theme-heading flex items-center gap-2"
              >
                <Briefcase size={18} />
                {isFreelancer ? "Find Work" : "Jobs"}
              </Link>
            )}
            <Link
              href="/services"
              className="text-theme-text hover:text-theme-heading flex items-center gap-2"
            >
              <Search size={18} /> Services
            </Link>
            <Link
              href="/disputes"
              className="text-theme-text hover:text-theme-heading flex items-center gap-2"
            >
              <ShieldCheck size={18} /> Disputes
            </Link>
            <Link
              href="/dashboard"
              className="text-theme-text hover:text-theme-heading flex items-center gap-2"
            >
              <LayoutDashboard size={18} /> Dashboard
            </Link>
            <Link
              href="/messages"
              className="relative text-theme-text hover:text-theme-heading flex items-center gap-2"
            >
              <MessageSquare size={18} />
              Messages
              <UnreadBadge />
            </Link>
            {isClient && (
              <Link
                href="/post-job"
                className="text-theme-text hover:text-theme-heading flex items-center gap-2"
              >
                <PenLine size={18} /> Post a Job
              </Link>
            )}
            <div className="pt-4 border-t border-theme-border flex items-center justify-between px-2">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-theme-text">Notifications</span>
                <NotificationBell />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-theme-text">Theme</span>
                <ThemeToggleButton />
              </div>
            </div>
            <UserMenu className="w-fit" />
          </div>
        )}
      </div>
    </nav>
  );
}

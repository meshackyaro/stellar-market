"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function HeroSection() {
  const { user } = useAuth();

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-32">
      <div className="text-center max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-7xl font-bold text-theme-heading mb-6 leading-tight">
          Work Without Borders.{" "}
          <span className="bg-gradient-to-r from-stellar-blue to-stellar-purple bg-clip-text text-transparent">
            Pay Without Trust.
          </span>
        </h1>
        <p className="text-xl text-theme-text mb-10 max-w-2xl mx-auto">
          The decentralized freelance marketplace powered by Stellar. Smart
          contract escrow, on-chain reputation, and trustless dispute
          resolution.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/jobs" className="btn-primary flex items-center gap-2">
            Browse Jobs <ArrowRight size={18} />
          </Link>
          
          {user ? (
            <Link href="/dashboard" className="btn-secondary flex items-center gap-2">
              <LayoutDashboard size={18} />
              Go to Dashboard
            </Link>
          ) : (
            <Link href="/post-job" className="btn-secondary">
              Post a Job
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

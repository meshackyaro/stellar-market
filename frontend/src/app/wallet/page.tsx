"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Wallet,
  ExternalLink,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  Code2,
  Filter,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import { useAuth } from "@/context/AuthContext";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const STELLAR_EXPERT_BASE = "https://stellar.expert/explorer/testnet/tx";
const PAGE_LIMIT = 20;

type OpType = "all" | "payment" | "invoke_host_function" | "create_account";

interface HorizonOperation {
  id: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  source_account?: string;
  funder?: string;
  account?: string;
  starting_balance?: string;
  function?: string;
}

interface HorizonPage {
  _embedded: { records: HorizonOperation[] };
  _links: { next?: { href: string } };
}

function opIcon(type: string) {
  if (type === "payment" || type === "path_payment_strict_send" || type === "path_payment_strict_receive") {
    return <ArrowDownLeft size={16} className="text-green-400" />;
  }
  if (type === "invoke_host_function") {
    return <Code2 size={16} className="text-stellar-purple" />;
  }
  if (type === "create_account") {
    return <ArrowUpRight size={16} className="text-stellar-blue" />;
  }
  return <ArrowUpRight size={16} className="text-theme-text" />;
}

function opLabel(op: HorizonOperation): string {
  switch (op.type) {
    case "payment":
      return "Payment";
    case "path_payment_strict_send":
    case "path_payment_strict_receive":
      return "Path Payment";
    case "invoke_host_function":
      return "Contract Invocation";
    case "create_account":
      return "Create Account";
    case "change_trust":
      return "Change Trust";
    case "manage_sell_offer":
    case "manage_buy_offer":
      return "Manage Offer";
    default:
      return op.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function assetLabel(op: HorizonOperation): string {
  if (op.asset_type === "native") return "XLM";
  if (op.asset_code) return op.asset_code;
  if (op.starting_balance) return "XLM";
  return "—";
}

function counterparty(op: HorizonOperation, selfAddress: string): string {
  if (op.to && op.to !== selfAddress) return truncate(op.to);
  if (op.from && op.from !== selfAddress) return truncate(op.from);
  if (op.account && op.account !== selfAddress) return truncate(op.account);
  if (op.funder && op.funder !== selfAddress) return truncate(op.funder);
  return "—";
}

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function amount(op: HorizonOperation): string {
  if (op.amount) return `${parseFloat(op.amount).toLocaleString()} ${assetLabel(op)}`;
  if (op.starting_balance) return `${parseFloat(op.starting_balance).toLocaleString()} XLM`;
  return "—";
}

const TYPE_OPTIONS: { label: string; value: OpType }[] = [
  { label: "All", value: "all" },
  { label: "Payments", value: "payment" },
  { label: "Contract Calls", value: "invoke_host_function" },
  { label: "Account Creates", value: "create_account" },
];

export default function WalletPage() {
  const { address } = useWallet();
  const { token } = useAuth();

  const [ops, setOps] = useState<HorizonOperation[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<OpType>("all");

  const buildUrl = useCallback(
    (addr: string) =>
      `${HORIZON_URL}/accounts/${addr}/operations?limit=${PAGE_LIMIT}&order=desc`,
    [],
  );

  const fetchOps = useCallback(
    async (url: string, append = false) => {
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          if (res.status === 404) {
            setOps([]);
            setNextUrl(null);
            return;
          }
          throw new Error(`Horizon error: ${res.status}`);
        }
        const data: HorizonPage = await res.json();
        const records = data._embedded?.records ?? [];
        setOps((prev) => (append ? [...prev, ...records] : records));
        setNextUrl(data._links?.next?.href ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch transactions");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!address) return;
    fetchOps(buildUrl(address));
  }, [address, buildUrl, fetchOps]);

  const handleRefresh = () => {
    if (!address) return;
    setOps([]);
    setNextUrl(null);
    fetchOps(buildUrl(address));
  };

  const filtered = filter === "all" ? ops : ops.filter((op) => op.type === filter);

  if (!token) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center">
        <Wallet size={48} className="mx-auto text-theme-text mb-4" />
        <h1 className="text-2xl font-bold text-theme-heading mb-2">Sign in to view transactions</h1>
        <p className="text-theme-text mb-6">You need to be logged in to access your wallet history.</p>
        <Link href="/auth/login" className="btn-primary inline-block">
          Log In
        </Link>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center">
        <Wallet size={48} className="mx-auto text-theme-text mb-4" />
        <h1 className="text-2xl font-bold text-theme-heading mb-2">No wallet connected</h1>
        <p className="text-theme-text mb-6">
          Connect your Freighter wallet to view your on-chain transaction history.
        </p>
        <Link href="/auth/login" className="btn-primary inline-block">
          Connect Wallet
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-theme-heading mb-1">Transaction History</h1>
          <p className="text-sm text-theme-text font-mono">{address}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm py-2 px-4 disabled:opacity-50"
          aria-label="Refresh transactions"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        <Filter size={16} className="text-theme-text shrink-0" />
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === opt.value
                ? "bg-stellar-blue text-white"
                : "bg-theme-card border border-theme-border text-theme-text hover:border-stellar-blue"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse card flex items-center gap-4 py-4"
            >
              <div className="w-8 h-8 rounded-full bg-theme-border shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-theme-border rounded" />
                <div className="h-3 w-48 bg-theme-border rounded" />
              </div>
              <div className="h-4 w-20 bg-theme-border rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card flex items-start gap-3 text-theme-error border-theme-error/20 bg-theme-error/5">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <Wallet size={40} className="mx-auto text-theme-text mb-4" />
          <h3 className="text-lg font-semibold text-theme-heading mb-2">No transactions found</h3>
          <p className="text-theme-text text-sm">
            {filter !== "all"
              ? "No transactions match this filter. Try switching to All."
              : "This wallet has no recorded transactions on the Stellar testnet yet."}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {filtered.map((op) => (
              <div
                key={op.id}
                className="card flex items-center gap-4 hover:border-stellar-blue/30 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-theme-bg border border-theme-border flex items-center justify-center shrink-0">
                  {opIcon(op.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-theme-heading">
                      {opLabel(op)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-theme-text">
                    <span>{new Date(op.created_at).toLocaleString()}</span>
                    {counterparty(op, address) !== "—" && (
                      <span>· {counterparty(op, address)}</span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm font-medium text-theme-heading">
                    {amount(op)}
                  </div>
                  <a
                    href={`${STELLAR_EXPERT_BASE}/${op.transaction_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-stellar-blue hover:underline flex items-center gap-0.5 justify-end mt-0.5"
                    aria-label="View on Stellar Expert"
                  >
                    Explorer <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            ))}
          </div>

          {nextUrl && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => fetchOps(nextUrl, true)}
                disabled={loadingMore}
                className="btn-secondary px-6 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {loadingMore ? <Loader2 size={16} className="animate-spin" /> : null}
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}

          {!nextUrl && filtered.length > 0 && (
            <p className="text-center text-sm text-theme-text py-6">
              All transactions loaded.
            </p>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import {
  isConnected as freighterIsConnected,
  getAddress,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { rpc, Transaction, Horizon } from "@stellar/stellar-sdk";

interface WalletBalance {
  asset: string;
  balance: string;
}

interface WalletState {
  address: string | null;
  isConnecting: boolean;
  isFreighterInstalled: boolean | null;
  error: string | null;
  balance: string | null;
  balances: WalletBalance[];
  isLoadingBalance: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  signAndBroadcastTransaction: (
    xdr: string
  ) => Promise<{ hash: string; success: boolean; error?: string; resultXdr?: string }>;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

const STORAGE_KEY = "stellarmarket_wallet_connected";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export { truncateAddress };

// Stellar Horizon server for fetching balances
const HORIZON_URL = "https://horizon-testnet.stellar.org";
const horizonServer = new Horizon.Server(HORIZON_URL);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFreighterInstalled, setIsFreighterInstalled] = useState<
    boolean | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const balanceRefreshInterval = useRef<NodeJS.Timeout | null>(null);

  const checkFreighterInstalled = useCallback(async () => {
    try {
      const result = await freighterIsConnected();
      if (result.error) {
        setIsFreighterInstalled(false);
        return false;
      }
      setIsFreighterInstalled(result.isConnected);
      return result.isConnected;
    } catch {
      setIsFreighterInstalled(false);
      return false;
    }
  }, []);

  // Fetch wallet balance from Stellar Horizon
  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      setBalances([]);
      return;
    }

    setIsLoadingBalance(true);
    try {
      // Fetch all balances from Horizon
      const account = await horizonServer.loadAccount(address);
      const allBalances: WalletBalance[] = account.balances.map((b) => {
        if (b.asset_type === "native") {
          return { asset: "XLM", balance: b.balance };
        }
        return {
          asset: b.asset_type === "credit_alphanum4" || b.asset_type === "credit_alphanum12"
            ? `${b.asset_code}`
            : b.asset_type,
          balance: b.balance,
        };
      });

      // Sort XLM first, then by balance
      allBalances.sort((a, b) => {
        if (a.asset === "XLM") return -1;
        if (b.asset === "XLM") return 1;
        return parseFloat(b.balance) - parseFloat(a.balance);
      });

      setBalances(allBalances);
      
      // Set primary XLM balance (truncated to 2 decimal places)
      const xlmBalance = allBalances.find((b) => b.asset === "XLM");
      if (xlmBalance) {
        const truncated = parseFloat(xlmBalance.balance).toFixed(2);
        setBalance(truncated);
      }
    } catch (err) {
      console.error("Failed to fetch wallet balance:", err);
      // Don't clear existing balance on error - keep showing last known
    } finally {
      setIsLoadingBalance(false);
    }
  }, [address]);

  const restoreSession = useCallback(async () => {
    const wasConnected = localStorage.getItem(STORAGE_KEY);
    if (wasConnected !== "true") return;

    const installed = await checkFreighterInstalled();
    if (!installed) return;

    try {
      const result = await getAddress();
      if (result.error) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      setAddress(result.address);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [checkFreighterInstalled]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Fetch balance when address changes and set up periodic refresh
  useEffect(() => {
    if (address) {
      refreshBalance();
      // Refresh balance every 30 seconds
      balanceRefreshInterval.current = setInterval(refreshBalance, 30000);
    } else {
      setBalance(null);
      setBalances([]);
    }

    return () => {
      if (balanceRefreshInterval.current) {
        clearInterval(balanceRefreshInterval.current);
      }
    };
  }, [address, refreshBalance]);

  // Listen for Freighter's accountChanged event and auto-update publicKey.
  // Freighter dispatches a custom DOM event when the user switches accounts.
  useEffect(() => {
    const handleAccountChanged = async () => {
      try {
        const result = await getAddress();
        if (result.error) {
          // Switched to an account that revoked access — treat as disconnect.
          setAddress(null);
          setError(null);
          setBalance(null);
          setBalances([]);
          localStorage.removeItem(STORAGE_KEY);
        } else {
          setAddress(result.address);
        }
      } catch {
        // Ignore transient errors during account switching.
      }
    };

    window.addEventListener("freighter#accountChanged", handleAccountChanged);
    return () => {
      window.removeEventListener("freighter#accountChanged", handleAccountChanged);
    };
  }, []);

  // Listen for wallet disconnect events (wallet locked, extension removed, etc.)
  useEffect(() => {
    const handleDisconnect = async () => {
      // Verify if wallet is actually disconnected
      try {
        const result = await freighterIsConnected();
        if (result.error || !result.isConnected) {
          // Wallet is disconnected - clear state
          setAddress(null);
          setError(null);
          setBalance(null);
          setBalances([]);
          localStorage.removeItem(STORAGE_KEY);
          
          // Dispatch custom event for other components to react
          window.dispatchEvent(new CustomEvent("stellarmarket:walletDisconnected"));
        }
      } catch {
        // Error checking connection - assume disconnected
        setAddress(null);
        setError(null);
        setBalance(null);
        setBalances([]);
        localStorage.removeItem(STORAGE_KEY);
        window.dispatchEvent(new CustomEvent("stellarmarket:walletDisconnected"));
      }
    };

    // Listen for Freighter's disconnect event
    window.addEventListener("freighter#disconnected", handleDisconnect);
    
    // Also listen for visibility change to re-check connection
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && address) {
        // Re-verify connection when tab becomes visible
        handleDisconnect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("freighter#disconnected", handleDisconnect);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [address]);

  const connect = useCallback(async () => {
    setError(null);
    setIsConnecting(true);

    try {
      // Detect not-installed: window.freighter is undefined before the SDK
      // even attempts a connection.
      if (typeof window !== "undefined" && !(window as unknown as Record<string, unknown>).freighter) {
        setError("NOT_INSTALLED");
        return;
      }

      const installed = await checkFreighterInstalled();
      if (!installed) {
        setError("NOT_INSTALLED");
        return;
      }

      const accessResult = await requestAccess();
      if (accessResult.error) {
        const msg = typeof accessResult.error === "string"
          ? accessResult.error
          : (accessResult.error as { message?: string }).message ?? "";
        // Freighter returns a specific message when the wallet is locked
        if (msg.toLowerCase().includes("locked") || msg.toLowerCase().includes("unlock")) {
          setError("LOCKED");
        } else {
          setError(msg || "Failed to connect wallet");
        }
        return;
      }

      const addressResult = await getAddress();
      if (addressResult.error) {
        const msg = typeof addressResult.error === "string"
          ? addressResult.error
          : (addressResult.error as { message?: string }).message ?? "";
        setError(msg || "Failed to retrieve address");
        return;
      }

      setAddress(addressResult.address);
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      setError("An unexpected error occurred while connecting the wallet");
    } finally {
      setIsConnecting(false);
    }
  }, [checkFreighterInstalled]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
    setBalance(null);
    setBalances([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const signAndBroadcastTransaction = useCallback(
    async (xdr: string) => {
      try {
        const signedResult = await signTransaction(xdr, {
          networkPassphrase: "Test SDF Network ; September 2015",
        });

        if (signedResult.error) {
          return {
            success: false,
            hash: "",
            error: signedResult.error,
          };
        }

        const server = new rpc.Server("https://soroban-testnet.stellar.org");
        const tx = new Transaction(signedResult.signedTxXdr, "Test SDF Network ; September 2015");
        
        const sendResponse = await server.sendTransaction(tx);
        
        if (sendResponse.status !== "PENDING") {
          return {
            success: false,
            hash: sendResponse.hash,
            error: "Transaction submission failed",
          };
        }

        // Poll for confirmation
        let statusResponse;
        let attempts = 0;
        while (attempts <= 10) {
          statusResponse = await server.getTransaction(sendResponse.hash);

          if (statusResponse.status === rpc.Api.GetTransactionStatus.SUCCESS) {
            const successResponse = statusResponse as rpc.Api.GetSuccessfulTransactionResponse;
            return {
              success: true,
              hash: sendResponse.hash,
              resultXdr: successResponse.returnValue?.toXDR("base64"),
            };
          }

          if (statusResponse.status === rpc.Api.GetTransactionStatus.FAILED) {
            return {
              success: false,
              hash: sendResponse.hash,
              error: "Transaction failed on-chain",
            };
          }

          // NOT_FOUND = still pending, keep polling
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        return {
          success: false,
          hash: sendResponse.hash,
          error: "Transaction timed out or failed to confirm",
        };
      } catch (err: unknown) {
        return {
          success: false,
          hash: "",
          error: err instanceof Error ? err.message : "An error occurred during transaction",
        };
      }
    },
    []
  );

  const value = useMemo<WalletState>(
    () => ({
      address,
      isConnecting,
      isFreighterInstalled,
      error,
      balance,
      balances,
      isLoadingBalance,
      connect,
      disconnect,
      refreshBalance,
      signAndBroadcastTransaction,
    }),
    [
      address,
      isConnecting,
      isFreighterInstalled,
      error,
      balance,
      balances,
      isLoadingBalance,
      connect,
      disconnect,
      refreshBalance,
      signAndBroadcastTransaction,
    ]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}

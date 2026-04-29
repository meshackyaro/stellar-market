import {
  Account,
  Address,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";

export type ReputationTier = "None" | "Bronze" | "Silver" | "Gold" | "Platinum";

export type ReputationResult = {
  score: number;
  badgeTier: ReputationTier;
  reviewCount: number;
};

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";

const REPUTATION_CONTRACT_ID =
  process.env.NEXT_PUBLIC_REPUTATION_CONTRACT_ID || "";

const ESCROW_CONTRACT_ID = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID || "";

function getBadgeTier(averageRaw: number): ReputationTier {
  if (averageRaw >= 700) return "Platinum";
  if (averageRaw >= 500) return "Gold";
  if (averageRaw >= 300) return "Silver";
  if (averageRaw >= 100) return "Bronze";
  return "None";
}

function toNumber(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

function parse(native: unknown): ReputationResult | null {
  if (!native || typeof native !== "object") return null;

  const r = native as Record<string, unknown>;
  const totalScore = toNumber(r.total_score ?? r.totalScore);
  const totalWeight = toNumber(r.total_weight ?? r.totalWeight);
  const reviewCount = toNumber(r.review_count ?? r.reviewCount);

  if (!totalWeight) return null;

  const avgRaw = Math.floor(totalScore / totalWeight);

  return {
    score: avgRaw / 100,
    badgeTier: getBadgeTier(avgRaw),
    reviewCount,
  };
}

export class ContractService {
  static async getReputation(address: string): Promise<ReputationResult | null> {
    if (!address || !REPUTATION_CONTRACT_ID) return null;

    const server = new rpc.Server(RPC_URL);
    const contract = new Contract(REPUTATION_CONTRACT_ID);

    const source = new Account(
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      "0"
    );

    const tx = new TransactionBuilder(source, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          "get_reputation",
          nativeToScVal(Address.fromString(address), { type: "address" })
        )
      )
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(sim)) return null;

    const retval = sim.result?.retval;
    if (!retval) return null;

    const native = scValToNative(retval);
    return parse(native);
  }

  static async buildSubmitReviewTx(params: {
    reviewerPublicKey: string;
    revieweePublicKey: string;
    jobIdOnChain: string | number | bigint;
    rating: number;
    comment: string;
    stakeWeightStroops: string | number | bigint;
  }): Promise<string> {
    if (!REPUTATION_CONTRACT_ID) {
      throw new Error("Missing NEXT_PUBLIC_REPUTATION_CONTRACT_ID");
    }
    if (!ESCROW_CONTRACT_ID) {
      throw new Error("Missing NEXT_PUBLIC_ESCROW_CONTRACT_ID");
    }

    const server = new rpc.Server(RPC_URL);
    const contract = new Contract(REPUTATION_CONTRACT_ID);
    const account = await server.getAccount(params.reviewerPublicKey);

    const stakeWeight = BigInt(params.stakeWeightStroops);
    const jobId = BigInt(params.jobIdOnChain);

    const tx = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          "submit_review",
          nativeToScVal(Address.fromString(ESCROW_CONTRACT_ID), {
            type: "address",
          }),
          nativeToScVal(Address.fromString(params.reviewerPublicKey), {
            type: "address",
          }),
          nativeToScVal(Address.fromString(params.revieweePublicKey), {
            type: "address",
          }),
          nativeToScVal(jobId, { type: "u64" }),
          nativeToScVal(params.rating, { type: "u32" }),
          nativeToScVal(params.comment),
          nativeToScVal(stakeWeight, { type: "i128" }),
        ),
      )
      .setTimeout(30)
      .build();

    return tx.toXDR();
  }
}
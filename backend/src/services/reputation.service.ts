import { Contract, Address } from "@stellar/stellar-sdk";
import { config } from "../config";
import { ContractService } from "./contract.service";

export interface OnChainReputation {
  total_score: bigint;
  total_weight: bigint;
  review_count: number;
}

export class ReputationService {
  /**
   * Fetches the on-chain reputation for a given wallet address.
   */
  static async getReputation(walletAddress: string): Promise<OnChainReputation | null> {
    const contractId = config.stellar.reputationContractId;
    if (!contractId) {
      console.warn("REPUTATION_CONTRACT_ID not configured");
      return null;
    }

    try {
      const contract = new Contract(contractId);
      const native = await ContractService.simulateContractRead(
        contract.call("get_reputation", new Address(walletAddress).toScVal())
      );

      // result is a native object from scValToNative
      const rep = native as any;
      return {
        total_score: BigInt(rep.total_score ?? 0),
        total_weight: BigInt(rep.total_weight ?? 0),
        review_count: Number(rep.review_count ?? 0),
      };
    } catch (error) {
      // If user not found on-chain, contract might throw/revert
      console.warn(`Reputation not found for ${walletAddress}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }
}

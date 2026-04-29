import { xdr } from "@stellar/stellar-sdk";

/**
 * Parses the on-chain job ID from the Soroban contract return value XDR.
 *
 * The escrow contract's `create_job` function returns a `u64` representing the
 * sequential job ID. After a successful transaction, the return value is passed
 * as a base64-encoded `ScVal` XDR string.
 *
 * @param returnValueXdr - Base64-encoded ScVal XDR from the transaction's return value
 * @returns The on-chain job ID as a number
 * @throws Error if the XDR cannot be parsed or does not contain a valid u64 value
 */
export function parseJobIdFromResult(returnValueXdr: string): number {
  if (!returnValueXdr) {
    throw new Error("No return value XDR provided — cannot extract on-chain job ID");
  }

  try {
    const scVal = xdr.ScVal.fromXDR(returnValueXdr, "base64");

    // The contract returns Result<u64, EscrowError>.
    // On success, Soroban unwraps the Ok variant and the return value is the u64 directly.
    if (scVal.switch().name === "scvU64") {
      return Number(scVal.u64());
    }

    // Fallback: check if it's wrapped in an Ok variant (scvVec with Ok tag)
    throw new Error(
      `Unexpected ScVal type "${scVal.switch().name}" — expected scvU64 for the on-chain job ID`
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("on-chain job ID")) {
      throw err;
    }
    throw new Error(
      `Failed to parse on-chain job ID from transaction result: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

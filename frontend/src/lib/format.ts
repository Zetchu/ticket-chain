/** Formatting helpers shared across the UI. */

/** `0x70997970…dc79C8` — the conventional truncated wallet address. */
export function truncateAddress(address?: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** True when two addresses refer to the same account, ignoring checksum case. */
export function isSameAddress(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * The most useful sentence out of a wallet/contract error.
 *
 * viem surfaces the revert reason as `shortMessage` ("Ticket is not listed for
 * sale"); falling back to `message` would show the multi-paragraph dump that
 * includes the raw calldata.
 */
export function readableError(error: unknown): string {
  if (error && typeof error === 'object' && 'shortMessage' in error) {
    const short = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof short === 'string' && short.length > 0) return short;
  }
  if (error instanceof Error) return error.message.split('\n')[0];
  return 'Something went wrong';
}

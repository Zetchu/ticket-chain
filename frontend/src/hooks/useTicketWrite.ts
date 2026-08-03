import { useCallback, useEffect, useState } from 'react';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import type { Abi } from 'viem';

/** The three writes a ticket card can submit. */
export type TicketAction = 'buy' | 'list' | 'cancel';

/**
 * A contract call to submit.
 *
 * wagmi normally derives whether a function is payable from an `as const` ABI
 * and rejects `value` on the ones that aren't. Ours is imported from JSON at
 * runtime, so it's a plain `Abi` and payability can't be known at compile time
 * — hence the hand-written shape and the cast at the call below.
 */
interface WriteRequest {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

/**
 * One transaction lifecycle — sign, wait for the receipt, report — plus the
 * label of whichever action started it, so feedback can name what happened.
 *
 * `onConfirmed` runs once the receipt lands; the caller uses it to re-read the
 * on-chain state the write just invalidated.
 */
export function useTicketWrite(onConfirmed: () => void) {
  const [action, setAction] = useState<TicketAction | null>(null);
  const [isFeedbackOpen, setFeedbackOpen] = useState(false);

  const {
    data: hash,
    isPending: isSigning,
    mutate: writeContract,
    error,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isConfirmed) onConfirmed();
  }, [isConfirmed, onConfirmed]);

  const submit = useCallback(
    (nextAction: TicketAction, request: WriteRequest) => {
      setAction(nextAction);
      setFeedbackOpen(true);
      writeContract(request as Parameters<typeof writeContract>[0]);
    },
    [writeContract],
  );

  return {
    action,
    submit,
    /** Waiting on the wallet prompt. */
    isSigning,
    /** Signed, waiting for the block. */
    isConfirming,
    /** Neither state accepts another click. */
    isBusy: isSigning || isConfirming,
    isConfirmed,
    error,
    hash,
    isFeedbackOpen,
    closeFeedback: useCallback(() => setFeedbackOpen(false), []),
  };
}

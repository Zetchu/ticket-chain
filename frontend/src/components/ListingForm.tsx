import { Box, Button, TextField } from '@mui/material';
import { useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { ctaButtonSx, outlineButtonSx } from '../theme';

/**
 * Price entry for putting a ticket up for resale.
 *
 * The face-value ceiling is enforced here as well as on-chain: listing above it
 * is the one thing the whole project exists to prevent, so the UI should say so
 * before the wallet ever opens.
 */
export default function ListingForm({
  faceValue,
  initialPrice,
  isBusy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  faceValue: bigint;
  /** Starting value — the current asking price when editing a live listing. */
  initialPrice?: bigint;
  isBusy: boolean;
  submitLabel: string;
  onSubmit: (price: bigint) => void;
  onCancel: () => void;
}) {
  // Editing starts from the current asking price; a fresh listing starts at
  // face value, which is both the common case and the maximum allowed.
  const [priceInput, setPriceInput] = useState(() =>
    formatEther(initialPrice ?? faceValue),
  );

  const parsedPrice = (() => {
    const trimmed = priceInput.trim();
    if (trimmed === '') return undefined;
    try {
      return parseEther(trimmed);
    } catch {
      return undefined;
    }
  })();

  const isMalformed = priceInput.trim() !== '' && parsedPrice === undefined;
  const isTooHigh = parsedPrice !== undefined && parsedPrice > faceValue;
  const canSubmit = parsedPrice !== undefined && !isTooHigh && !isBusy;

  const helperText = isTooHigh
    ? `Above the ${formatEther(faceValue)} ETH face value — that's scalping`
    : isMalformed
      ? 'Enter an amount in ETH, e.g. 0.05'
      : `Anything up to ${formatEther(faceValue)} ETH`;

  return (
    <Box
      component='form'
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && parsedPrice !== undefined) onSubmit(parsedPrice);
      }}
    >
      <TextField
        fullWidth
        size='small'
        autoFocus
        label='Asking price (ETH)'
        value={priceInput}
        onChange={(event) => setPriceInput(event.target.value)}
        error={isTooHigh || isMalformed}
        helperText={helperText}
        slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': 'Asking price in ETH' } }}
        sx={{ mb: 1.5 }}
      />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          fullWidth
          variant='outlined'
          disabled={isBusy}
          onClick={onCancel}
          sx={outlineButtonSx}
        >
          Cancel
        </Button>
        <Button
          fullWidth
          type='submit'
          variant='contained'
          disableElevation
          disabled={!canSubmit}
          sx={ctaButtonSx(false, isBusy)}
        >
          {submitLabel}
        </Button>
      </Box>
    </Box>
  );
}

import { Box } from '@mui/material';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import { useState } from 'react';
import { monoLabelSx, tokens } from '../theme';

/**
 * Artwork for a ticket.
 *
 * Shows the image the organizer uploaded for the event, which the contract
 * stores as a content hash and the P2P node serves. Tickets minted without one
 * fall back to a gradient seeded by the token ID, so a card is never an empty
 * grey box — and so is a ticket whose image fails to load, which on a localized
 * network means the node holding it is simply not reachable from here.
 */

const PALETTES = [
  [tokens.violet, '#4b0f9c'],
  ['#2b7fff', tokens.violetDeep],
  [tokens.cyanDeep, '#1b2a6b'],
  [tokens.orange, '#7a1f6b'],
  ['#00a37a', '#0b3a6b'],
  ['#c026d3', '#3b0764'],
] as const;

export default function TicketArtwork({
  tokenId,
  imageUrl,
  height = 168,
}: {
  tokenId: number;
  /** Organizer's uploaded artwork, as resolved by the contract. */
  imageUrl?: string;
  height?: number;
}) {
  const [hasFailed, setFailed] = useState(false);
  const [from, to] = PALETTES[tokenId % PALETTES.length];
  // Rotate the gradient per token as well, so neighbouring IDs differ visibly.
  const angle = 130 + ((tokenId * 37) % 90);

  if (imageUrl && !hasFailed) {
    return (
      <Box
        component='img'
        src={imageUrl}
        alt=''
        loading='lazy'
        onError={() => setFailed(true)}
        sx={{ display: 'block', width: '100%', height, objectFit: 'cover' }}
      />
    );
  }

  return (
    <Box
      aria-hidden
      sx={{
        position: 'relative',
        height,
        overflow: 'hidden',
        background: `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {/* Faint grid, echoing the page background, to read as "protocol art". */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
          opacity: 0.35,
        }}
      />
      {/* Darken toward the bottom so overlaid chips stay legible. */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(11,11,15,0.75) 100%)',
        }}
      />

      <Box sx={{ position: 'relative', textAlign: 'center', color: 'rgba(255,255,255,0.85)' }}>
        <ConfirmationNumberOutlinedIcon sx={{ fontSize: 30, opacity: 0.9 }} />
        <Box sx={{ ...monoLabelSx, mt: 0.5, letterSpacing: '0.12em' }}>#{tokenId}</Box>
      </Box>
    </Box>
  );
}

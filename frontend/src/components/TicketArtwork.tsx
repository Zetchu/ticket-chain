import { Box } from '@mui/material';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import { monoLabelSx, tokens } from '../theme';

/**
 * Placeholder artwork for a ticket.
 *
 * Tickets carry no image on-chain yet, so rather than shipping a single grey
 * box for every card, the token ID seeds a deterministic gradient: each ticket
 * looks like itself, the same way every time, with no network request. Swap the
 * whole component out once real metadata/IPFS art exists.
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
  height = 168,
}: {
  tokenId: number;
  height?: number;
}) {
  const [from, to] = PALETTES[tokenId % PALETTES.length];
  // Rotate the gradient per token as well, so neighbouring IDs differ visibly.
  const angle = 130 + ((tokenId * 37) % 90);

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

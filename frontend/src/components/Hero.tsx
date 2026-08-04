import { Box, Container, Typography } from '@mui/material';
import { useTicketBoard } from '../hooks/useTicketBoard';
import StatusChip from './StatusChip';
import { displayGlowSx, tokens } from '../theme';

/**
 * The masthead above the marketplace.
 *
 * The status chip reports something true — whether this node's P2P feed is
 * answering — rather than decorating the page with a "mainnet live" badge that
 * would be a lie on a local chain.
 */
export default function Hero() {
  const { isError, isPending } = useTicketBoard();

  const feedState = isPending ? 'pending' : isError ? 'offline' : 'live';

  return (
    <Box component='header' sx={{ textAlign: 'center', pt: { xs: 8, md: 12 }, pb: { xs: 6, md: 9 } }}>
      <Container maxWidth='md'>
        <StatusChip
          tone={feedState === 'live' ? 'cyan' : feedState === 'offline' ? 'orange' : 'neutral'}
          label={
            feedState === 'live'
              ? 'P2P Node Live'
              : feedState === 'offline'
                ? 'P2P Node Offline'
                : 'Connecting'
          }
          sx={{ mb: 3 }}
        />

        <Typography
          variant='h1'
          sx={{
            ...displayGlowSx,
            fontSize: { xs: '2rem', sm: '2.75rem', md: '3.25rem' },
            color: 'text.primary',
            mb: 2.5,
          }}
        >
          Local, peer-to-peer,
          <br />
          <Box
            component='span'
            sx={{
              background: `linear-gradient(90deg, ${tokens.violetBright}, ${tokens.orange})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            impossible to scalp.
          </Box>
        </Typography>

        <Typography
          sx={{
            color: 'text.secondary',
            fontSize: { xs: '1rem', md: '1.125rem' },
            lineHeight: 1.6,
            maxWidth: 560,
            mx: 'auto',
          }}
        >
          Every ticket is a verified on-chain asset with a price ceiling built in —
          sold once, resold at face value, never more.
        </Typography>
      </Container>
    </Box>
  );
}

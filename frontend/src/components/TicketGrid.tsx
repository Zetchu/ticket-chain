// src/components/TicketGrid.tsx
import { Typography, Box, Grid, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import TicketCard, { type Ticket } from './TicketCard';

const REPO_URL = 'https://github.com/Zetchu/ticket-chain.git';

// Fetch function targeting the live PyIPv8 local server
const fetchP2PTickets = async (): Promise<Ticket[]> => {
  const response = await fetch('http://127.0.0.1:8080/tickets');
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
};

// The P2P node and local Hardhat chain only ever listen on 127.0.0.1 — by
// design, this is a *localized* network, not a hosted service. Visitors to
// a deployed build (e.g. Vercel) are on their own machine, which has no such
// node running, so the fetch above will always fail there. That's expected,
// not a fault — a visitor on localhost, on the other hand, genuinely has a
// reachability problem worth surfacing as one.
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export default function TicketGrid({ isConnected }: { isConnected: boolean }) {
  // React Query hook to manage the data fetching and caching
  const {
    data: tickets,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ['p2pTickets'],
    queryFn: fetchP2PTickets,
    retry: isLocalHost ? 2 : 0, // no point retrying a fetch that can't ever resolve
  });

  return (
    <Box component='section'>
      <Typography
        sx={{
          fontSize: '1.5rem',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'text.primary',
          mb: 4,
        }}
      >
        Available Events
      </Typography>

      {isPending ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress size={26} thickness={4} sx={{ color: 'text.secondary' }} />
        </Box>
      ) : isError ? (
        isLocalHost ? (
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '16px',
              p: 4,
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
              Can't reach the local network
            </Typography>
            <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary' }}>
              Make sure the PyIPv8 node is running on port 8080. ({error.message})
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '16px',
              p: { xs: 3, sm: 5 },
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'text.primary', mb: 1 }}>
              This demo runs on your local network
            </Typography>
            <Typography
              sx={{
                fontSize: '0.9rem',
                color: 'text.secondary',
                maxWidth: 460,
                mx: 'auto',
                mb: 3,
              }}
            >
              TicketChain discovers tickets over a peer-to-peer overlay and a
              local blockchain node, both of which run on your own machine —
              not this hosted page. Run the project locally to see live
              ticket data and complete a purchase.
            </Typography>
            <Box
              component='pre'
              sx={{
                display: 'inline-block',
                textAlign: 'left',
                bgcolor: '#f5f5f7',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '10px',
                px: 2.5,
                py: 1.75,
                m: 0,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.82rem',
                color: 'text.primary',
                lineHeight: 1.7,
                overflowX: 'auto',
              }}
            >
              {`git clone ${REPO_URL}\ncd ticket-chain && ./start_dev.sh`}
            </Box>
          </Box>
        )
      ) : tickets && tickets.length > 0 ? (
        <Grid container spacing={2.5}>
          {tickets.map((ticket) => (
            <Grid
              // A token can appear both mined and pending, so the status is
              // part of the key.
              key={`${ticket.type}-${ticket.id}`}
              size={{ xs: 12, sm: 6, md: 4 }}
            >
              <TicketCard
                ticket={ticket}
                isConnected={isConnected}
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem' }}>
            No local tickets discovered on the P2P network yet.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

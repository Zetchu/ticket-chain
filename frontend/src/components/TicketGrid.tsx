// src/components/TicketGrid.tsx
import { Typography, Box, Grid, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import TicketCard, { type Ticket } from './TicketCard';

// Fetch function targeting the live PyIPv8 local server
const fetchP2PTickets = async (): Promise<Ticket[]> => {
  const response = await fetch('http://127.0.0.1:8080/tickets');
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
};

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
    retry: 2, // Retries in case the Python node is still booting up
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

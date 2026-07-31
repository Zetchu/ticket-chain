// src/components/TicketGrid.tsx
import { Typography, Box, Grid, CircularProgress, Alert } from '@mui/material';
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
    <Box sx={{ mt: 4, mb: 8 }}>
      <Typography
        variant='h5'
        gutterBottom
        sx={{ borderBottom: '1px solid #334155', pb: 2, mb: 4, color: 'white' }}
      >
        Available Events
      </Typography>

      {/* Render loading, error, or the live data grid */}
      {isPending ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert severity='error'>
          Failed to fetch P2P tickets. Ensure the PyIPv8 node is running on port
          8080. ({error.message})
        </Alert>
      ) : tickets && tickets.length > 0 ? (
        <Grid
          container
          spacing={3}
        >
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
        <Typography color='text.secondary'>
          No local tickets discovered on the P2P network.
        </Typography>
      )}
    </Box>
  );
}

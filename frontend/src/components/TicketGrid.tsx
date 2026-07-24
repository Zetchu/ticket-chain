import { Typography, Box, Grid } from '@mui/material';
import TicketCard from './TicketCard';

const MOCK_TICKETS = [
  {
    id: 1,
    title: 'Sónar Festival 2026',
    date: 'June 2026',
    location: 'Fira Montjuïc, Barcelona',
    price: '150 USDC',
    type: '3-Day Pass',
  },
  {
    id: 2,
    title: 'Mobile World Congress',
    date: 'March 2026',
    location: 'Fira Gran Via, Barcelona',
    price: '850 USDC',
    type: 'Standard Entry',
  },
  {
    id: 3,
    title: 'Talent Arena',
    date: 'March 2026',
    location: 'Fira Montjuïc, Barcelona',
    price: 'Face Value',
    type: 'Developer Pass',
  },
];

export default function TicketGrid({ isConnected }: { isConnected: boolean }) {
  return (
    <Box sx={{ mt: 4, mb: 8 }}>
      <Typography
        variant='h5'
        gutterBottom
        sx={{ borderBottom: '1px solid #334155', pb: 2, mb: 4, color: 'white' }}
      >
        Available Events
      </Typography>
      <Grid
        container
        spacing={3}
      >
        {MOCK_TICKETS.map((ticket) => (
          <Grid
            key={ticket.id}
            size={{ xs: 12, sm: 6, md: 4 }}
          >
            <TicketCard
              ticket={ticket}
              isConnected={isConnected}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

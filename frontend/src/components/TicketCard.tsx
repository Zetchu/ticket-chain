import {
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Chip,
  CircularProgress,
} from '@mui/material';
// import { useReadContract } from 'wagmi';

/* 
// Mock ABI for reading ticket data 
const mockAbi = [
  {
    inputs: [{ name: 'ticketId', type: 'uint256' }],
    name: 'getTicketDetails',
    outputs: [{ name: 'price', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
*/

export default function TicketCard({
  ticket,
  isConnected,
}: {
  ticket: any;
  isConnected: boolean;
}) {
  // --- TEMPORARILY DISABLED WAGMI HOOK (Waiting for local Hardhat node) ---
  /*
  const { data, isPending, error } = useReadContract({
    address: '0x0000000000000000000000000000000000000000', 
    abi: mockAbi,
    functionName: 'getTicketDetails',
    args: [BigInt(ticket.id)],
  });
  */

  // Forced Mock State for UI Development
  const isPending = false;
  const error = null;

  return (
    <Card sx={{ bgcolor: '#1e293b', color: 'white', borderRadius: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Chip
            label={ticket.type}
            size='small'
            sx={{
              bgcolor: 'rgba(59, 130, 246, 0.1)',
              color: '#3b82f6',
              fontWeight: 700,
            }}
          />

          {/* Handle loading/error states from the contract read */}
          {isPending ? (
            <CircularProgress size={20} />
          ) : error ? (
            <Typography
              color='error'
              variant='body2'
            >
              Network Error
            </Typography>
          ) : (
            <Typography sx={{ color: '#10b981', fontWeight: 700 }}>
              {ticket.price}
            </Typography>
          )}
        </Box>

        <Typography
          variant='h6'
          gutterBottom
        >
          {ticket.title}
        </Typography>
        <Typography
          variant='body2'
          sx={{ color: '#94a3b8', mb: 1 }}
        >
          📍 {ticket.location}
        </Typography>
        <Typography
          variant='body2'
          sx={{ color: '#94a3b8', mb: 3 }}
        >
          📅 {ticket.date}
        </Typography>

        <Button
          variant='contained'
          fullWidth
          disabled={!isConnected}
          sx={{ bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' } }}
        >
          {isConnected ? 'Purchase Ticket' : 'Connect to Buy'}
        </Button>
      </CardContent>
    </Card>
  );
}

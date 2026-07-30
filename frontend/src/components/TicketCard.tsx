// src/components/TicketCard.tsx
import {
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Chip,
  CircularProgress,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi';
import { useState } from 'react';
// import { parseEther } from 'viem'; // Uncomment if the price needs conversion to wei

// The ABI provided by your Smart Contract Lead (Issue 1)
const ticketABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'resaleTransfer',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'ticketId', type: 'uint256' }],
    name: 'getTicketDetails',
    outputs: [{ name: 'price', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export default function TicketCard({
  ticket,
  isConnected,
}: {
  ticket: any;
  isConnected: boolean;
}) {
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  // 1. Read the live price from the contract
  const {
    data: onChainPrice,
    isPending: isReadPending,
    error: readError,
  } = useReadContract({
    address: '0x5FbDB2315678afecb367f032d93F642f64180aa3', // Replace with the actual deployed address
    abi: ticketABI,
    functionName: 'getTicketDetails',
    args: [BigInt(ticket.id)],
  });

  // 2. Setup the write hook for the purchase transaction
  const {
    data: hash,
    isPending: isWritePending,
    writeContract,
    error: writeError,
  } = useWriteContract();

  // 3. Wait for the transaction to be confirmed on the blockchain
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });

  const handlePurchase = () => {
    setSnackbarOpen(true);
    writeContract({
      address: '0xYourContractAddressHere', // Replace with the actual deployed address
      abi: ticketABI,
      functionName: 'resaleTransfer',
      args: [BigInt(ticket.id)],
      // value: parseEther(ticket.price.replace(/[^0-9.]/g, '')), // Send the required payment
    });
  };

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

          {/* Display live contract data or loading states */}
          {isReadPending ? (
            <CircularProgress size={20} />
          ) : readError ? (
            <Typography
              color='error'
              variant='body2'
            >
              Network Error
            </Typography>
          ) : (
            <Typography sx={{ color: '#10b981', fontWeight: 700 }}>
              {onChainPrice ? onChainPrice.toString() : ticket.price}
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

        {/* Dynamic button state based on the transaction lifecycle */}
        <Button
          variant='contained'
          fullWidth
          onClick={handlePurchase}
          disabled={!isConnected || isWritePending || isConfirming}
          sx={{ bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' } }}
        >
          {isWritePending
            ? 'Confirm in Wallet...'
            : isConfirming
              ? 'Waiting for Block...'
              : isConfirmed
                ? 'Purchased!'
                : isConnected
                  ? 'Purchase Ticket'
                  : 'Connect to Buy'}
        </Button>
      </CardContent>

      {/* MUI Snackbar for transaction feedback */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
      >
        {writeError ? (
          <Alert
            severity='error'
            onClose={() => setSnackbarOpen(false)}
          >
            Transaction Failed: {writeError.message.slice(0, 50)}...
          </Alert>
        ) : isConfirmed ? (
          <Alert
            severity='success'
            onClose={() => setSnackbarOpen(false)}
          >
            Transaction Confirmed! View Hash: {hash?.slice(0, 6)}...
          </Alert>
        ) : (
          <Alert severity='info'>Transaction pending...</Alert>
        )}
      </Snackbar>
    </Card>
  );
}

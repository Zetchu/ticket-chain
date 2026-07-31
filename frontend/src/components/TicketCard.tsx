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
import { formatEther, type Abi } from 'viem';
import TicketNFTData from '../contracts/TicketNFT.json'; // Written by scripts/deploy.js

// Importing JSON widens these to `string` / `unknown[]`, but wagmi wants a
// 0x-prefixed address and an Abi, so restate the types here.
const contractAddress = TicketNFTData.address as `0x${string}`;
const ticketAbi = TicketNFTData.abi as Abi;

/** A ticket offering from the P2P node — see network/api.py `_tx_to_ticket`. */
export interface Ticket {
  /** On-chain ERC-721 token ID; what the contract calls below are keyed on. */
  id: number;
  type: string;
  price: string;
  title: string;
  location: string;
  date: string;
}

export default function TicketCard({
  ticket,
  isConnected,
}: {
  ticket: Ticket;
  isConnected: boolean;
}) {
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  // Read the live price from the contract
  const {
    data: onChainPrice,
    isPending: isReadPending,
    error: readError,
  } = useReadContract({
    address: contractAddress,
    abi: ticketAbi,
    functionName: 'getTicketDetails',
    args: [BigInt(ticket.id)],
  });

  // A non-const ABI gives back `unknown`; getTicketDetails returns uint256.
  const price = onChainPrice as bigint | undefined;

  // Setup the write hook for the purchase transaction
  const {
    data: hash,
    isPending: isWritePending,
    writeContract,
    error: writeError,
  } = useWriteContract();

  // Wait for the transaction to be confirmed on the blockchain
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });

  const handlePurchase = () => {
    if (price === undefined) return; // Price unknown — nothing safe to send
    setSnackbarOpen(true);
    writeContract({
      address: contractAddress,
      abi: ticketAbi,
      functionName: 'resaleTransfer',
      args: [BigInt(ticket.id)],
      // resaleTransfer is payable and requires exactly the face value.
      value: price,
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
              {price !== undefined
                ? `${formatEther(price)} ETH`
                : ticket.price}
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
          onClick={handlePurchase}
          disabled={
            !isConnected ||
            price === undefined ||
            isWritePending ||
            isConfirming
          }
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

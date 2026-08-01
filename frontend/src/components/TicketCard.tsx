// src/components/TicketCard.tsx
import { Card, CardContent, Typography, Button, Box, Snackbar, Alert } from '@mui/material';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
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

  const isPending = isConnected && (isWritePending || isConfirming);

  return (
    <Card
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3.5,
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease',
        '&:hover': {
          borderColor: '#bcbcc0',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: ticket.type === 'Confirmed' ? '#30d158' : '#ff9f0a',
              }}
            />
            <Typography
              sx={{ fontSize: '0.78rem', color: 'text.secondary', fontWeight: 500 }}
            >
              {ticket.type}
            </Typography>
          </Box>

          {isReadPending ? (
            <Box
              sx={{
                width: 48,
                height: 16,
                borderRadius: 1,
                bgcolor: '#f0f0f2',
              }}
            />
          ) : readError ? (
            <Typography sx={{ fontSize: '0.8rem', color: '#ff3b30' }}>Unavailable</Typography>
          ) : (
            <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.primary' }}>
              {price !== undefined ? `${formatEther(price)} ETH` : ticket.price}
            </Typography>
          )}
        </Box>

        <Typography sx={{ fontSize: '1.15rem', fontWeight: 600, color: 'text.primary', mb: 0.75 }}>
          {ticket.title}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <LocationOnOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
              {ticket.location}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <CalendarTodayOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
              {ticket.date}
            </Typography>
          </Box>
        </Box>

        <Button
          variant='contained'
          disableElevation
          fullWidth
          onClick={handlePurchase}
          disabled={!isConnected || price === undefined || isWritePending || isConfirming}
          sx={{
            bgcolor: isConfirmed ? '#30d158' : 'text.primary',
            color: '#ffffff',
            py: 1.1,
            fontSize: '0.92rem',
            '&:hover': { bgcolor: isConfirmed ? '#30d158' : '#000000' },
            '&.Mui-disabled': {
              bgcolor: isPending ? '#1d1d1f' : '#e8e8ed',
              color: isPending ? 'rgba(255,255,255,0.7)' : '#a1a1a6',
            },
          }}
        >
          {isWritePending
            ? 'Confirm in wallet…'
            : isConfirming
              ? 'Processing…'
              : isConfirmed
                ? 'Purchased'
                : isConnected
                  ? 'Buy Ticket'
                  : 'Connect to buy'}
        </Button>
      </CardContent>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {writeError ? (
          <Alert
            severity='error'
            variant='outlined'
            onClose={() => setSnackbarOpen(false)}
            sx={{ bgcolor: 'background.paper' }}
          >
            Transaction failed: {writeError.message.slice(0, 50)}...
          </Alert>
        ) : isConfirmed ? (
          <Alert
            severity='success'
            variant='outlined'
            onClose={() => setSnackbarOpen(false)}
            sx={{ bgcolor: 'background.paper' }}
          >
            Confirmed — {hash?.slice(0, 6)}…{hash?.slice(-4)}
          </Alert>
        ) : (
          <Alert severity='info' variant='outlined' sx={{ bgcolor: 'background.paper' }}>
            Transaction pending…
          </Alert>
        )}
      </Snackbar>
    </Card>
  );
}

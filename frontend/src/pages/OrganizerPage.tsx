import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Divider,
  InputAdornment,
} from '@mui/material';
import { useConnection } from 'wagmi';
import { formatEther } from 'viem';
import PageHeader from '../components/PageHeader';
import TransactionSnackbar from '../components/TransactionSnackbar';
import { useTicketBoard } from '../hooks/useTicketBoard';
import { useTicketWrite } from '../hooks/useTicketWrite';
import { ticketAddress, ticketAbi } from '../contracts/ticketNFT';
import { isSameAddress } from '../lib/format';

export default function OrganizerPage() {
  const navigate = useNavigate();
  const { address, isConnected } = useConnection();
  const [quantity, setQuantity] = useState(1);

  const { owned, faceValue, totalMinted, owner, isPending, refresh } = useTicketBoard();

  const { action, submit, isBusy, isConfirmed, error, hash, isFeedbackOpen, closeFeedback } =
    useTicketWrite(refresh);

  const isOrganizer = isSameAddress(address, owner);

  // Redirect non-organizer wallets once the owner address is known.
  useEffect(() => {
    if (!isPending && (!isConnected || (owner !== undefined && !isOrganizer))) {
      navigate('/', { replace: true });
    }
  }, [isPending, isConnected, owner, isOrganizer, navigate]);

  if (!isConnected || !isOrganizer) return null;

  const heldCount = owned.length;
  const listedCount = owned.filter((e) => e.listing?.active).length;
  const soldCount = totalMinted - heldCount;

  const handleMint = () => {
    submit('mint', {
      address: ticketAddress,
      abi: ticketAbi,
      functionName: 'mintAndList',
      args: [BigInt(quantity)],
    });
  };

  const faceValueLabel = faceValue !== undefined ? `${formatEther(faceValue)} ETH` : '0.05 ETH';

  return (
    <Box component='section'>
      <PageHeader
        title='Organizer Panel'
        subtitle='Issue new tickets and manage the primary market.'
      />

      {/* Stats row */}
      <Box
        sx={{
          display: 'flex',
          gap: { xs: 4, sm: 6 },
          mb: 5,
          flexWrap: 'wrap',
        }}
      >
        <StatBox label='Total minted' value={totalMinted} />
        <StatBox label='Available' value={listedCount} description='listed by you' />
        <StatBox label='Sold' value={soldCount} description='transferred out' />
      </Box>

      <Divider sx={{ mb: 4 }} />

      {/* Mint form */}
      <Typography
        sx={{ fontSize: '1.05rem', fontWeight: 600, color: 'text.primary', mb: 0.75 }}
      >
        Mint & List Tickets
      </Typography>
      <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', mb: 3, maxWidth: 480 }}>
        Each ticket is minted to your wallet and immediately listed at {faceValueLabel}. Buyers
        can purchase them from the Buy Tickets page — payment goes directly to you.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <TextField
          label='Quantity'
          type='number'
          size='small'
          value={quantity}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) setQuantity(Math.max(1, Math.min(50, v)));
          }}
          slotProps={{
            input: { inputProps: { min: 1, max: 50 } },
            htmlInput: { min: 1, max: 50 },
          }}
          sx={{ width: 130 }}
          InputProps={{
            endAdornment: <InputAdornment position='end'>tickets</InputAdornment>,
          }}
        />
        <Button
          variant='contained'
          disableElevation
          onClick={handleMint}
          disabled={isBusy}
          sx={{
            bgcolor: 'text.primary',
            color: 'background.default',
            py: 0.95,
            '&:hover': { bgcolor: 'text.primary', opacity: 0.85 },
            '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' },
          }}
        >
          {isBusy ? 'Processing…' : 'Mint & List'}
        </Button>
      </Box>

      <TransactionSnackbar
        open={isFeedbackOpen}
        onClose={closeFeedback}
        action={action}
        error={error}
        isConfirmed={isConfirmed}
        hash={hash}
      />
    </Box>
  );
}

function StatBox({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description?: string;
}) {
  return (
    <Box>
      <Typography
        sx={{ fontSize: '2.2rem', fontWeight: 700, lineHeight: 1, color: 'text.primary' }}
      >
        {value}
      </Typography>
      <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', mt: 0.5 }}>
        {label}
        {description && (
          <Box component='span' sx={{ color: 'text.disabled', ml: 0.5 }}>
            · {description}
          </Box>
        )}
      </Typography>
    </Box>
  );
}

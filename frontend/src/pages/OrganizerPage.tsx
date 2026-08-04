import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, TextField, Button, InputAdornment, Grid } from '@mui/material';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import type { ReactNode } from 'react';
import { useConnection } from 'wagmi';
import { formatEther } from 'viem';
import PageHeader from '../components/PageHeader';
import TransactionSnackbar from '../components/TransactionSnackbar';
import { useTicketBoard } from '../hooks/useTicketBoard';
import { useTicketWrite } from '../hooks/useTicketWrite';
import { ticketAddress, ticketAbi } from '../contracts/ticketNFT';
import { isSameAddress, truncateAddress } from '../lib/format';
import {
  ctaButtonSx,
  FONT_DISPLAY,
  glassPanelSx,
  monoLabelSx,
  tokens,
} from '../theme';

export default function OrganizerPage() {
  const navigate = useNavigate();
  const { address, isConnected } = useConnection();
  const [quantity, setQuantity] = useState(1);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');

  const { all, owned, faceValue, totalMinted, owner, isPending, refresh } = useTicketBoard();

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

  const listedCount = owned.filter((e) => e.listing?.active).length;

  // Counted from on-chain owners rather than `totalMinted - held`: tickets
  // issued straight to an attendee with mintTicket() were never held by the
  // organizer, and buying one back would otherwise push the count negative.
  const soldCount = all.filter(
    (e) => e.owner !== undefined && !isSameAddress(e.owner, owner),
  ).length;

  // datetime-local gives a local wall-clock string; the contract stores Unix
  // seconds, so it is converted once here at the boundary.
  const eventDateSeconds = eventDate ? Math.floor(new Date(eventDate).getTime() / 1000) : 0;
  const canMint =
    eventName.trim().length > 0 && eventDateSeconds > 0 && quantity > 0 && !isBusy;

  const handleMint = () => {
    if (!canMint) return;
    submit('mint', {
      address: ticketAddress,
      abi: ticketAbi,
      functionName: 'mintAndList',
      args: [BigInt(quantity), eventName.trim(), BigInt(eventDateSeconds)],
    });
  };

  const faceValueLabel = faceValue !== undefined ? `${formatEther(faceValue)} ETH` : '0.05 ETH';

  return (
    <Box component='section'>
      <PageHeader
        title='Organizer Dashboard'
        subtitle='Issue new passes onto the chain and watch the primary market in real time.'
      />

      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatTile
            label='Total minted'
            value={totalMinted}
            tone={tokens.violetBright}
            icon={<ConfirmationNumberOutlinedIcon sx={{ fontSize: 18 }} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatTile
            label='Available'
            value={listedCount}
            description='listed by you'
            tone={tokens.cyan}
            icon={<StorefrontOutlinedIcon sx={{ fontSize: 18 }} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatTile
            label='Sold'
            value={soldCount}
            description='held by others'
            tone={tokens.orange}
            icon={<SellOutlinedIcon sx={{ fontSize: 18 }} />}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Box sx={{ ...glassPanelSx, p: { xs: 2.5, sm: 3.5 }, height: '100%' }}>
            <Typography
              sx={{ ...monoLabelSx, textTransform: 'uppercase', color: tokens.outline, mb: 2 }}
            >
              Contract
            </Typography>

            <DataRow label='Address' value={truncateAddress(ticketAddress)} title={ticketAddress} />
            <DataRow label='Organizer' value={truncateAddress(owner)} title={owner} />
            <DataRow label='Face value' value={faceValueLabel} />
            <DataRow label='Standard' value='ERC-721 · anti-scalping' last />

            <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', mt: 3, lineHeight: 1.7 }}>
              Every ticket in a batch carries the event name and date you enter, is minted to your
              wallet, and is listed at {faceValueLabel}. Buyers purchase from the Buy Tickets page —
              payment goes directly to you, and no resale can ever exceed face value.
            </Typography>
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Box
            component='form'
            onSubmit={(e) => {
              e.preventDefault();
              handleMint();
            }}
            sx={{ ...glassPanelSx, p: { xs: 2.5, sm: 3.5 }, height: '100%' }}
          >
            <Typography
              sx={{
                fontFamily: FONT_DISPLAY,
                fontSize: '1.15rem',
                fontWeight: 600,
                color: 'text.primary',
                mb: 3,
              }}
            >
              Mint &amp; List Tickets
            </Typography>

            <FieldLabel>Event name</FieldLabel>
            <TextField
              fullWidth
              size='small'
              required
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder='Sunset Festival'
              sx={{ mb: 2.5 }}
            />

            <FieldLabel>Event date</FieldLabel>
            <TextField
              fullWidth
              type='datetime-local'
              size='small'
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              sx={{ mb: 2.5 }}
            />

            <FieldLabel>Quantity to mint</FieldLabel>
            <TextField
              fullWidth
              type='number'
              size='small'
              value={quantity}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) setQuantity(Math.max(1, Math.min(50, v)));
              }}
              // MUI v9 removed the legacy `InputProps`/`inputProps` props: the
              // `input` slot is the outer Input component (adornments live here),
              // `htmlInput` is the native <input> (min/max live there).
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position='end'>
                      <Box sx={{ ...monoLabelSx, color: tokens.outline }}>MAX 50</Box>
                    </InputAdornment>
                  ),
                },
                htmlInput: { min: 1, max: 50 },
              }}
              sx={{ mb: 3.5 }}
            />

            <Button
              type='submit'
              fullWidth
              variant='contained'
              disabled={!canMint}
              startIcon={<RocketLaunchOutlinedIcon />}
              sx={{ ...ctaButtonSx(false, isBusy), py: 1.4, fontSize: '0.95rem' }}
            >
              {isBusy ? 'Processing…' : 'Mint & List'}
            </Button>
          </Box>
        </Grid>
      </Grid>

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

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{ ...monoLabelSx, textTransform: 'uppercase', color: tokens.outline, mb: 1 }}
    >
      {children}
    </Typography>
  );
}

function DataRow({
  label,
  value,
  title,
  last = false,
}: {
  label: string;
  value?: string;
  title?: string;
  last?: boolean;
}) {
  return (
    <Box
      title={title}
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 2,
        py: 1.25,
        borderBottom: last ? 'none' : '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      <Typography sx={{ ...monoLabelSx, color: tokens.outline, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography sx={{ ...monoLabelSx, color: 'text.primary' }}>{value ?? '—'}</Typography>
    </Box>
  );
}

function StatTile({
  label,
  value,
  description,
  tone,
  icon,
}: {
  label: string;
  value: number;
  description?: string;
  tone: string;
  icon: ReactNode;
}) {
  return (
    <Box
      sx={{
        ...glassPanelSx,
        p: 2.5,
        height: '100%',
        borderColor: `${tone}59`,
        boxShadow: `0 0 24px ${tone}1f`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: tone, mb: 1.5 }}>
        {icon}
        <Typography sx={{ ...monoLabelSx, textTransform: 'uppercase' }}>{label}</Typography>
      </Box>
      <Typography
        sx={{
          fontFamily: FONT_DISPLAY,
          fontSize: '2.25rem',
          fontWeight: 700,
          lineHeight: 1,
          color: 'text.primary',
        }}
      >
        {value}
      </Typography>
      {description && (
        <Typography sx={{ ...monoLabelSx, color: tokens.outline, mt: 1 }}>
          {description}
        </Typography>
      )}
    </Box>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, TextField, Button, InputAdornment, Grid } from '@mui/material';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import type { ReactNode } from 'react';
import { useConnection } from 'wagmi';
import { parseEther } from 'viem';
import PageHeader from '../components/PageHeader';
import TransactionSnackbar from '../components/TransactionSnackbar';
import { useTicketBoard } from '../hooks/useTicketBoard';
import { useTicketWrite } from '../hooks/useTicketWrite';
import { ticketAddress, ticketAbi } from '../contracts/ticketNFT';
import { isSameAddress, truncateAddress } from '../lib/format';
import { ACCEPTED_IMAGE_TYPES, uploadEventImage } from '../lib/uploadImage';
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
  const [priceEth, setPriceEth] = useState('0.05');
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [image, setImage] = useState<{ file: File; preview: string; hash?: string } | null>(null);
  const [isUploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [maxPerBuyer, setMaxPerBuyer] = useState(0);

  const { all, owned, totalMinted, owner, isPending, refresh } = useTicketBoard();

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

  // Face value the batch is minted at, in wei. undefined = not a valid price.
  const priceWei = (() => {
    try {
      const wei = parseEther(priceEth as `${number}`);
      return wei > 0n ? wei : undefined;
    } catch {
      return undefined;
    }
  })();

  const canMint =
    eventName.trim().length > 0 &&
    eventDateSeconds > 0 &&
    quantity > 0 &&
    priceWei !== undefined &&
    !isBusy &&
    !isUploading;

  const handleMint = async () => {
    if (!canMint) return;

    // The image is uploaded before minting so the transaction carries a hash
    // that already resolves; a failed upload must not produce a ticket
    // pointing at artwork the node never stored.
    let imageRef = image?.hash ?? '';
    if (image && !image.hash) {
      setUploading(true);
      setUploadError(null);
      try {
        const uploaded = await uploadEventImage(image.file);
        imageRef = uploaded.hash;
        setImage((current) => (current ? { ...current, hash: uploaded.hash } : current));
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed.');
        return;
      } finally {
        setUploading(false);
      }
    }

    submit('mint', {
      address: ticketAddress,
      abi: ticketAbi,
      functionName: 'mintAndList',
      args: [
        BigInt(quantity),
        eventName.trim(),
        BigInt(eventDateSeconds),
        imageRef,
        priceWei!,
        BigInt(maxPerBuyer),
      ],
    });
  };

  const chooseImage = (file?: File) => {
    setUploadError(null);
    if (!file) return;
    // A fresh file invalidates any hash from a previous upload.
    setImage({ file, preview: URL.createObjectURL(file) });
  };


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
            <DataRow label='Face value' value='Set per event' />
            <DataRow label='Standard' value='ERC-721 · anti-scalping' last />

            <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', mt: 3, lineHeight: 1.7 }}>
              Every ticket in a batch carries the event name and date you enter, is minted to your
              wallet, and is listed at the face value you set. Buyers purchase from the Buy Tickets
              page — payment goes directly to you, and no resale can ever exceed that face value.
              The face value is permanent: it caps every future resale of the batch and cannot be
              lowered afterwards, though each new event can be priced freely.
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
              sx={{ mb: 2.5 }}
            />

            <FieldLabel>Face value per ticket</FieldLabel>
            <TextField
              fullWidth
              size='small'
              required
              value={priceEth}
              onChange={(e) => setPriceEth(e.target.value)}
              error={priceEth !== '' && priceWei === undefined}
              helperText='Permanent — caps every future resale of this batch and cannot be lowered later.'
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position='end'>
                      <Box sx={{ ...monoLabelSx, color: tokens.outline }}>ETH</Box>
                    </InputAdornment>
                  ),
                },
                htmlInput: { inputMode: 'decimal' },
              }}
              sx={{ mb: 2.5 }}
            />

            <FieldLabel>Max per buyer</FieldLabel>
            <TextField
              fullWidth
              type='number'
              size='small'
              value={maxPerBuyer}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) setMaxPerBuyer(Math.max(0, v));
              }}
              helperText='0 = unlimited. Otherwise, no single wallet can buy more than this from the primary sale.'
              slotProps={{ htmlInput: { min: 0 } }}
              sx={{ mb: 2.5 }}
            />

            <FieldLabel>Event artwork (optional)</FieldLabel>
            <Box
              component='label'
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 1.5,
                mb: uploadError ? 1 : 3.5,
                borderRadius: '4px',
                border: '1px dashed',
                borderColor: image ? tokens.violet : 'rgba(255, 255, 255, 0.18)',
                bgcolor: 'rgba(0, 0, 0, 0.3)',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease',
                '&:hover': { borderColor: tokens.violet },
              }}
            >
              <input
                hidden
                type='file'
                accept={ACCEPTED_IMAGE_TYPES}
                onChange={(e) => chooseImage(e.target.files?.[0])}
              />

              {image ? (
                <Box
                  component='img'
                  src={image.preview}
                  alt=''
                  sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: '4px' }}
                />
              ) : (
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '4px',
                    bgcolor: 'rgba(255, 255, 255, 0.04)',
                    color: tokens.outline,
                  }}
                >
                  <ImageOutlinedIcon fontSize='small' />
                </Box>
              )}

              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.85rem', color: 'text.primary' }}>
                  {image ? image.file.name : 'Choose an image'}
                </Typography>
                <Typography sx={{ ...monoLabelSx, color: tokens.outline, mt: 0.5 }}>
                  {isUploading
                    ? 'Uploading to the P2P node…'
                    : image
                      ? `${(image.file.size / 1024).toFixed(0)} KB · stored on the node at mint`
                      : 'PNG, JPEG, WebP or GIF — generated art is used without one'}
                </Typography>
              </Box>
            </Box>

            {uploadError && (
              <Typography
                sx={{ ...monoLabelSx, color: tokens.error, mb: 2.5, display: 'block' }}
              >
                {uploadError}
              </Typography>
            )}

            <Button
              type='submit'
              fullWidth
              variant='contained'
              disabled={!canMint}
              startIcon={<RocketLaunchOutlinedIcon />}
              sx={{ ...ctaButtonSx(false, isBusy || isUploading), py: 1.4, fontSize: '0.95rem' }}
            >
              {isUploading ? 'Uploading…' : isBusy ? 'Processing…' : 'Mint & List'}
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

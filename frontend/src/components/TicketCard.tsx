// src/components/TicketCard.tsx
import { Box, Button, Card, CardContent, Tooltip, Typography } from '@mui/material';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import { useState } from 'react';
import { useConnection } from 'wagmi';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import { formatEther } from 'viem';
import { ticketAbi, ticketAddress } from '../contracts/ticketNFT';
import type { BoardTicket } from '../hooks/useTicketBoard';
import { useTicketWrite } from '../hooks/useTicketWrite';
import { truncateAddress } from '../lib/format';
import { watchTicket, WatchAssetUnsupported } from '../lib/watchAsset';
import {
  ctaButtonSx,
  FONT_DISPLAY,
  ghostButtonSx,
  glassPanelSx,
  monoLabelSx,
  outlineButtonSx,
  tokens,
} from '../theme';
import ListingForm from './ListingForm';
import SkeletonBar from './SkeletonBar';
import StatusChip from './StatusChip';
import TicketArtwork from './TicketArtwork';
import TransactionSnackbar from './TransactionSnackbar';

export default function TicketCard({
  entry,
  isConnected,
  onChainRefresh,
}: {
  entry: BoardTicket;
  isConnected: boolean;
  /** Re-read on-chain state after a write confirms. */
  onChainRefresh: () => void;
}) {
  // faceValue is per ticket — each event's batch sets its own resale ceiling.
  const { ticket, owner, listing, isOwnedByViewer, imageUrl, faceValue } = entry;
  const [isListingFormRequested, setListingFormRequested] = useState(false);
  const [walletNotice, setWalletNotice] = useState<string | null>(null);
  const { connector } = useConnection();

  const write = useTicketWrite(onChainRefresh);

  const isListed = listing?.active === true;
  const isChainStateLoaded = faceValue !== undefined && listing !== undefined;

  // The form closes itself once the listing it submitted is confirmed.
  const isListingFormOpen =
    isListingFormRequested && !(write.isConfirmed && write.action === 'list');

  const buy = () => {
    if (!listing?.active) return;
    write.submit('buy', {
      address: ticketAddress,
      abi: ticketAbi,
      functionName: 'resaleTransfer',
      args: [BigInt(ticket.id)],
      // resaleTransfer is payable and requires exactly the listed price.
      value: listing.price,
    });
  };

  const list = (price: bigint) =>
    write.submit('list', {
      address: ticketAddress,
      abi: ticketAbi,
      functionName: 'listForSale',
      args: [BigInt(ticket.id), price],
    });

  const cancel = () =>
    write.submit('cancel', {
      address: ticketAddress,
      abi: ticketAbi,
      functionName: 'cancelListing',
      args: [BigInt(ticket.id)],
    });

  const busyLabel = write.isSigning
    ? 'Confirm in wallet…'
    : write.isConfirming
      ? 'Processing…'
      : null;

  // MetaMask cannot discover NFTs on a local chain, so a freshly minted ticket
  // stays invisible in the wallet until it is registered by hand. Offer to do
  // it in one prompt instead.
  const addToWallet = async () => {
    if (!connector) return;
    setWalletNotice(null);
    try {
      const added = await watchTicket(connector, ticket.id);
      setWalletNotice(added ? 'Added to your wallet.' : 'Not added.');
    } catch (error) {
      setWalletNotice(
        error instanceof WatchAssetUnsupported
          ? error.message
          : 'Could not add the ticket to your wallet.',
      );
    }
  };

  const priceLabel = isChainStateLoaded
    ? `${formatEther(isListed ? listing.price : faceValue)} ETH`
    : null;

  return (
    <Card
      elevation={0}
      sx={{
        ...glassPanelSx,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
        '&:hover': {
          borderColor: 'rgba(153, 69, 255, 0.4)',
          boxShadow: '0 0 30px rgba(153, 69, 255, 0.15)',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <Box sx={{ position: 'relative' }}>
        <TicketArtwork tokenId={ticket.id} imageUrl={imageUrl} />
        <Box sx={{ position: 'absolute', top: 12, right: 12 }}>
          <StatusChip
            tone={isListed ? 'cyan' : 'neutral'}
            label={isListed ? 'Listed' : 'Not listed'}
          />
        </Box>
        {isOwnedByViewer && (
          <Box sx={{ position: 'absolute', top: 12, left: 12 }}>
            <StatusChip tone='violet' label='Yours' />
          </Box>
        )}
      </Box>

      <CardContent
        sx={{
          p: 2.5,
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          '&:last-child': { pb: 2.5 },
        }}
      >
        <Typography
          component='h3'
          sx={{
            fontFamily: FONT_DISPLAY,
            fontSize: '1.15rem',
            fontWeight: 600,
            lineHeight: 1.3,
            color: 'text.primary',
            mb: 1.5,
          }}
        >
          {ticket.title}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 2 }}>
          <DetailRow icon={<CalendarTodayOutlinedIcon sx={{ fontSize: 14 }} />} text={ticket.date} />
          <DetailRow
            icon={<LocationOnOutlinedIcon sx={{ fontSize: 15 }} />}
            text={ticket.location}
          />
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 1,
            pt: 2,
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <Box>
            <Typography sx={{ ...monoLabelSx, color: tokens.outline, textTransform: 'uppercase' }}>
              {isListed ? 'Asking price' : 'Face value'}
            </Typography>
            {priceLabel ? (
              <Typography
                sx={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: tokens.orange,
                  lineHeight: 1.2,
                  mt: 0.25,
                }}
              >
                {priceLabel}
              </Typography>
            ) : (
              <Box sx={{ mt: 0.75 }}>
                <SkeletonBar width={78} height={18} />
              </Box>
            )}
          </Box>

          <OwnerTag owner={owner} isViewer={isOwnedByViewer} />
        </Box>

        {/* Actions sit at the bottom edge however tall the card grows. */}
        <Box sx={{ mt: 'auto', pt: 2 }}>
          {isOwnedByViewer && (
            <Box sx={{ mb: 1 }}>
              <Button
                fullWidth
                startIcon={<AccountBalanceWalletOutlinedIcon sx={{ fontSize: 16 }} />}
                onClick={addToWallet}
                sx={{ ...ghostButtonSx, justifyContent: 'center' }}
              >
                Show in wallet
              </Button>
              {walletNotice && (
                <Typography
                  sx={{ ...monoLabelSx, color: tokens.outline, mt: 0.5, display: 'block' }}
                >
                  {walletNotice}
                </Typography>
              )}
            </Box>
          )}
          {isOwnedByViewer ? (
            isListingFormOpen && faceValue !== undefined ? (
              <ListingForm
                faceValue={faceValue}
                initialPrice={isListed ? listing.price : undefined}
                isBusy={write.isBusy}
                submitLabel={busyLabel ?? (isListed ? 'Update price' : 'List ticket')}
                onSubmit={list}
                onCancel={() => setListingFormRequested(false)}
              />
            ) : isListed ? (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  fullWidth
                  disabled={write.isBusy}
                  onClick={() => setListingFormRequested(true)}
                  sx={outlineButtonSx}
                >
                  {busyLabel ?? 'Change price'}
                </Button>
                <Button disabled={write.isBusy} onClick={cancel} sx={ghostButtonSx}>
                  Unlist
                </Button>
              </Box>
            ) : (
              <Button
                fullWidth
                variant='contained'
                disabled={!isChainStateLoaded || write.isBusy}
                onClick={() => setListingFormRequested(true)}
                sx={ctaButtonSx(false, write.isBusy)}
              >
                {busyLabel ?? 'List for resale'}
              </Button>
            )
          ) : (
            <Button
              fullWidth
              variant='contained'
              onClick={buy}
              disabled={!isConnected || !isListed || write.isBusy}
              sx={ctaButtonSx(write.isConfirmed && write.action === 'buy', write.isBusy)}
            >
              {busyLabel ??
                (write.isConfirmed && write.action === 'buy'
                  ? 'Purchased'
                  : !isChainStateLoaded
                    ? 'Loading…'
                    : !isListed
                      ? 'Not for sale'
                      : isConnected
                        ? 'Buy Ticket'
                        : 'Connect to buy')}
            </Button>
          )}
        </Box>
      </CardContent>

      <TransactionSnackbar
        open={write.isFeedbackOpen}
        onClose={write.closeFeedback}
        action={write.action}
        error={write.error}
        isConfirmed={write.isConfirmed}
        hash={write.hash}
      />
    </Card>
  );
}

function DetailRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: tokens.outline }}>
      {icon}
      <Typography sx={{ ...monoLabelSx, color: 'text.secondary' }}>{text}</Typography>
    </Box>
  );
}

/** Current holder of the ticket, flagged when it's the connected wallet. */
function OwnerTag({ owner, isViewer }: { owner?: string; isViewer: boolean }) {
  if (!owner) return <SkeletonBar width={84} height={14} />;

  return (
    <Tooltip title={owner} placement='top'>
      <Box sx={{ textAlign: 'right', minWidth: 0 }}>
        <Typography sx={{ ...monoLabelSx, color: tokens.outline, textTransform: 'uppercase' }}>
          Owner
        </Typography>
        <Typography
          sx={{
            ...monoLabelSx,
            color: isViewer ? tokens.violetBright : 'text.secondary',
            mt: 0.5,
          }}
        >
          {truncateAddress(owner)}
        </Typography>
      </Box>
    </Tooltip>
  );
}

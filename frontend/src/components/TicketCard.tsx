// src/components/TicketCard.tsx
import { Box, Button, Card, CardContent, Tooltip, Typography } from '@mui/material';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import { useState } from 'react';
import { formatEther } from 'viem';
import { ticketAbi, ticketAddress } from '../contracts/ticketNFT';
import type { BoardTicket } from '../hooks/useTicketBoard';
import { useTicketWrite } from '../hooks/useTicketWrite';
import { truncateAddress } from '../lib/format';
import { filledButtonSx, hoverBorder, outlinedButtonSx } from '../theme';
import ListingForm from './ListingForm';
import SkeletonBar from './SkeletonBar';
import TransactionSnackbar from './TransactionSnackbar';

export default function TicketCard({
  entry,
  isConnected,
  faceValue,
  onChainRefresh,
}: {
  entry: BoardTicket;
  isConnected: boolean;
  /** The contract's face value — the ceiling every listing is capped at. */
  faceValue?: bigint;
  /** Re-read on-chain state after a write confirms. */
  onChainRefresh: () => void;
}) {
  const { ticket, owner, listing, isOwnedByViewer } = entry;
  const [isListingFormRequested, setListingFormRequested] = useState(false);

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

  return (
    <Card
      elevation={0}
      sx={(theme) => ({
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3.5,
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease',
        '&:hover': {
          borderColor: hoverBorder(theme.palette.mode),
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 4px 20px rgba(0, 0, 0, 0.4)'
              : '0 4px 20px rgba(0, 0, 0, 0.06)',
          transform: 'translateY(-2px)',
        },
      })}
    >
      <CardContent
        sx={{ p: 3, display: 'flex', flexDirection: 'column', flexGrow: 1, '&:last-child': { pb: 3 } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: ticket.type === 'Confirmed' ? 'success.main' : 'warning.main',
              }}
            />
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', fontWeight: 500 }}>
              {ticket.type}
            </Typography>
          </Box>

          {!isChainStateLoaded ? (
            <SkeletonBar width={56} height={18} />
          ) : (
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.primary' }}>
                {formatEther(isListed ? listing.price : faceValue)} ETH
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                {isListed ? 'asking price' : 'face value'}
              </Typography>
            </Box>
          )}
        </Box>

        <Typography
          component='h3'
          sx={{ fontSize: '1.15rem', fontWeight: 600, color: 'text.primary', mb: 0.75 }}
        >
          {ticket.title}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
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

        <OwnerRow owner={owner} isViewer={isOwnedByViewer} />

        {/* Actions sit at the bottom edge however tall the card grows. */}
        <Box sx={{ mt: 'auto', pt: 2.5 }}>
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
              // A live listing of your own: change what you're asking, or pull
              // it off the market entirely.
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  fullWidth
                  variant='outlined'
                  disabled={write.isBusy}
                  onClick={() => setListingFormRequested(true)}
                  sx={outlinedButtonSx}
                >
                  {busyLabel ?? 'Change price'}
                </Button>
                <Button
                  fullWidth
                  disabled={write.isBusy}
                  onClick={cancel}
                  sx={{
                    py: 1.1,
                    fontSize: '0.92rem',
                    color: 'text.secondary',
                    '&:hover': { color: 'error.main', bgcolor: 'transparent' },
                  }}
                >
                  Unlist
                </Button>
              </Box>
            ) : (
              <Button
                fullWidth
                variant='contained'
                disableElevation
                disabled={!isChainStateLoaded || write.isBusy}
                onClick={() => setListingFormRequested(true)}
                sx={filledButtonSx(false, write.isBusy)}
              >
                {busyLabel ?? 'List for resale'}
              </Button>
            )
          ) : (
            <Button
              fullWidth
              variant='contained'
              disableElevation
              onClick={buy}
              disabled={!isConnected || !isListed || write.isBusy}
              sx={filledButtonSx(write.isConfirmed && write.action === 'buy', write.isBusy)}
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

/** Current holder of the ticket, flagged when it's the connected wallet. */
function OwnerRow({ owner, isViewer }: { owner?: string; isViewer: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        pt: 2,
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Owner</Typography>

      {owner ? (
        <Tooltip title={owner} placement='top'>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Typography
              sx={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.78rem',
                color: 'text.secondary',
              }}
            >
              {truncateAddress(owner)}
            </Typography>
            {isViewer && (
              <Typography
                sx={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  color: 'primary.main',
                  border: '1px solid',
                  borderColor: 'primary.main',
                  borderRadius: 100,
                  px: 0.75,
                  lineHeight: 1.6,
                }}
              >
                You
              </Typography>
            )}
          </Box>
        </Tooltip>
      ) : (
        <SkeletonBar width={88} />
      )}
    </Box>
  );
}

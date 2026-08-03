import { Alert, Snackbar, Link as MuiLink } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { readableError } from '../lib/format';
import type { TicketAction } from '../hooks/useTicketWrite';

const ACTION_NOUN: Record<TicketAction, string> = {
  buy: 'Purchase',
  list: 'Listing',
  cancel: 'Cancellation',
  mint: 'Minting',
};

/** Transaction feedback: pending, reverted, or confirmed with the tx hash. */
export default function TransactionSnackbar({
  open,
  onClose,
  action,
  error,
  isConfirmed,
  hash,
}: {
  open: boolean;
  onClose: () => void;
  action: TicketAction | null;
  error: unknown;
  isConfirmed: boolean;
  hash?: `0x${string}`;
}) {
  const noun = action ? ACTION_NOUN[action] : 'Transaction';

  return (
    <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      {error ? (
        <Alert
          severity='error'
          variant='outlined'
          onClose={onClose}
          sx={{ bgcolor: 'background.paper' }}
        >
          {noun} failed — {readableError(error)}
        </Alert>
      ) : isConfirmed ? (
        <Alert
          severity='success'
          variant='outlined'
          onClose={onClose}
          sx={{ bgcolor: 'background.paper' }}
        >
          {noun} confirmed — {hash?.slice(0, 6)}…{hash?.slice(-4)}
          {action === 'buy' && (
            <>
              {' · '}
              <MuiLink component={RouterLink} to='/my-tickets' color='inherit'>
                View in My Tickets
              </MuiLink>
            </>
          )}
        </Alert>
      ) : (
        <Alert severity='info' variant='outlined' sx={{ bgcolor: 'background.paper' }}>
          Waiting for confirmation…
        </Alert>
      )}
    </Snackbar>
  );
}

import { Box, Typography } from '@mui/material';
import { useConnection } from 'wagmi';
import TicketGrid, { TicketGridSkeleton } from '../components/TicketGrid';
import StatePanel from '../components/StatePanel';
import FeedErrorPanel from '../components/FeedErrorPanel';
import PageHeader from '../components/PageHeader';
import StatusChip from '../components/StatusChip';
import { useTicketBoard } from '../hooks/useTicketBoard';

export default function BuyTicketsPage() {
  const { isConnected } = useConnection();
  const { market, owned, owner, isPending, isError, error, refresh } = useTicketBoard();

  const listedCount = market.filter((entry) => entry.listing?.active).length;

  return (
    <Box component='section'>
      <PageHeader
        title='Available Passes'
        subtitle='Every ticket on the local P2P network, capped at its original face value. Your own tickets appear here once you list them for resale.'
        action={
          !isPending && !isError ? (
            <StatusChip
              tone={listedCount > 0 ? 'cyan' : 'neutral'}
              label={`${listedCount} for sale · ${market.length} on network`}
            />
          ) : undefined
        }
      />

      {isPending ? (
        <TicketGridSkeleton />
      ) : isError ? (
        <FeedErrorPanel error={error} />
      ) : market.length > 0 ? (
        <>
          {listedCount === 0 && (
            <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', mb: 2.5 }}>
              Nothing is currently for sale — no owner has listed a ticket yet.
            </Typography>
          )}
          <TicketGrid
            entries={market}
            isConnected={isConnected}
            onChainRefresh={refresh}
            contractOwner={owner}
          />
        </>
      ) : owned.length > 0 ? (
        <StatePanel
          title='Nothing on the market right now'
          description='No one else is offering a ticket. The tickets you hold are on the My Tickets page — list one and it will appear here.'
        />
      ) : (
        <StatePanel
          title='No tickets minted yet'
          description='The organizer has not issued any tickets on this network. Connect the organizer wallet and mint a batch from the Organizer page.'
        />
      )}
    </Box>
  );
}

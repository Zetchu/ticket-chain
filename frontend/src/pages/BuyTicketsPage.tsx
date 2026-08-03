import { Box, Typography } from '@mui/material';
import { useConnection } from 'wagmi';
import TicketGrid, { TicketGridSkeleton } from '../components/TicketGrid';
import StatePanel from '../components/StatePanel';
import FeedErrorPanel from '../components/FeedErrorPanel';
import PageHeader from '../components/PageHeader';
import { useTicketBoard } from '../hooks/useTicketBoard';

export default function BuyTicketsPage() {
  const { isConnected } = useConnection();
  const { market, owned, faceValue, isPending, isError, error, refresh } = useTicketBoard();

  const listedCount = market.filter((entry) => entry.listing?.active).length;

  return (
    <Box component='section'>
      <PageHeader
        title='Buy Tickets'
        subtitle='Tickets on the local P2P network, capped at their original face value. Your own tickets show up here once you list them for resale.'
      />

      {isPending ? (
        <TicketGridSkeleton />
      ) : isError ? (
        <FeedErrorPanel error={error} />
      ) : market.length > 0 ? (
        <>
          {listedCount === 0 && (
            <Typography sx={{ fontSize: '0.88rem', color: 'text.secondary', mb: 2.5 }}>
              Nothing is currently for sale — no owner has listed a ticket yet.
            </Typography>
          )}
          <TicketGrid
            entries={market}
            isConnected={isConnected}
            faceValue={faceValue}
            onChainRefresh={refresh}
          />
        </>
      ) : owned.length > 0 ? (
        <StatePanel
          title='Nothing on the market right now'
          description='No one else is offering a ticket. The tickets you hold are on the My Tickets page — list one and it will appear here.'
        />
      ) : (
        <StatePanel
          title='No tickets discovered yet'
          description='The P2P node has not seen any ticket offerings on the local network.'
        />
      )}
    </Box>
  );
}

import { Box } from '@mui/material';
import { useConnection } from 'wagmi';
import TicketGrid, { TicketGridSkeleton } from '../components/TicketGrid';
import StatePanel from '../components/StatePanel';
import FeedErrorPanel from '../components/FeedErrorPanel';
import PageHeader from '../components/PageHeader';
import ConnectPrompt from '../components/ConnectPrompt';
import { useTicketBoard } from '../hooks/useTicketBoard';

export default function MyTicketsPage() {
  const { isConnected } = useConnection();
  const { owned, isPending, isError, error, refresh } = useTicketBoard();

  return (
    <Box component='section'>
      <PageHeader
        align='center'
        title='My Tickets'
        subtitle='Passes held by this wallet. Listing one offers it for resale at or below face value.'
      />

      {!isConnected ? (
        <ConnectPrompt message='Connect your wallet to see the tickets it holds.' />
      ) : isPending ? (
        <TicketGridSkeleton />
      ) : isError ? (
        <FeedErrorPanel error={error} />
      ) : owned.length > 0 ? (
        <TicketGrid
          entries={owned}
          isConnected={isConnected}
          onChainRefresh={refresh}
        />
      ) : (
        <StatePanel
          title='No tickets yet'
          description='This wallet does not hold any tickets on the network. Buy one to see it here.'
        />
      )}
    </Box>
  );
}

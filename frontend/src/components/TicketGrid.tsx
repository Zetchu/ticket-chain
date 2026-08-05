// src/components/TicketGrid.tsx
import { Grid } from '@mui/material';
import TicketCard from './TicketCard';
import TicketCardSkeleton from './TicketCardSkeleton';
import type { BoardTicket } from '../hooks/useTicketBoard';

const GRID_SIZE = { xs: 12, sm: 6, md: 4 } as const;

/** Responsive layout for a set of ticket cards. Pure presentation. */
export default function TicketGrid({
  entries,
  isConnected,
  onChainRefresh,
}: {
  entries: BoardTicket[];
  isConnected: boolean;
  onChainRefresh: () => void;
}) {
  return (
    <Grid container spacing={2.5}>
      {entries.map((entry) => (
        <Grid key={entry.ticket.id} size={GRID_SIZE}>
          <TicketCard
            entry={entry}
            isConnected={isConnected}
            onChainRefresh={onChainRefresh}
          />
        </Grid>
      ))}
    </Grid>
  );
}

/** Placeholder grid shown while the feed and chain reads are in flight. */
export function TicketGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Grid container spacing={2.5} aria-busy='true' aria-label='Loading tickets'>
      {Array.from({ length: count }, (_, index) => (
        <Grid key={index} size={GRID_SIZE}>
          <TicketCardSkeleton />
        </Grid>
      ))}
    </Grid>
  );
}

import { Box, Card, CardContent } from '@mui/material';
import SkeletonBar from './SkeletonBar';
import { glassPanelSx } from '../theme';

/** The shape of a TicketCard while its data loads — same rhythm, no content. */
export default function TicketCardSkeleton() {
  return (
    <Card elevation={0} sx={{ ...glassPanelSx, height: '100%', overflow: 'hidden' }}>
      <Box sx={{ height: 168, bgcolor: 'rgba(255, 255, 255, 0.04)' }} />

      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <SkeletonBar width='65%' height={20} />

        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <SkeletonBar width='50%' />
          <SkeletonBar width='60%' />
        </Box>

        <Box
          sx={{
            mt: 2.5,
            pt: 2,
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <SkeletonBar width={90} height={22} />
          <SkeletonBar width={70} height={22} />
        </Box>

        <Box sx={{ mt: 2.5 }}>
          <SkeletonBar width='100%' height={40} />
        </Box>
      </CardContent>
    </Card>
  );
}

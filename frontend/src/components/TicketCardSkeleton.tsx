import { Box, Card, CardContent } from '@mui/material';
import SkeletonBar from './SkeletonBar';

/** The shape of a TicketCard while its data loads — same rhythm, no content. */
export default function TicketCardSkeleton() {
  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3.5,
      }}
    >
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2.5 }}>
          <SkeletonBar width={72} />
          <SkeletonBar width={56} height={18} />
        </Box>

        <SkeletonBar width='60%' height={20} />
        <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <SkeletonBar width='75%' />
          <SkeletonBar width='55%' />
        </Box>

        <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <SkeletonBar width='45%' />
        </Box>

        <Box sx={{ mt: 2.5 }}>
          <SkeletonBar width='100%' height={40} />
        </Box>
      </CardContent>
    </Card>
  );
}

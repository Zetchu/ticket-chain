import { Box } from '@mui/material';

/** A neutral block standing in for text or a control while it loads. */
export default function SkeletonBar({
  width,
  height = 14,
}: {
  width: number | string;
  height?: number;
}) {
  return (
    <Box
      sx={{
        width,
        height,
        borderRadius: '4px',
        bgcolor: 'rgba(255, 255, 255, 0.06)',
      }}
    />
  );
}

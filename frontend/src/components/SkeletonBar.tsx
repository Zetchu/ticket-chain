import { Box } from '@mui/material';
import { mutedSurface } from '../theme';

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
      sx={(theme) => ({
        width,
        height,
        borderRadius: 1,
        bgcolor: mutedSurface(theme.palette.mode),
      })}
    />
  );
}

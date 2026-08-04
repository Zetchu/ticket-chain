import { Box, type SxProps, type Theme } from '@mui/material';
import { monoLabelSx, tokens } from '../theme';

export type StatusTone = 'violet' | 'orange' | 'cyan' | 'neutral';

const TONES: Record<StatusTone, string> = {
  violet: tokens.violetBright,
  orange: tokens.orange,
  cyan: tokens.cyan,
  neutral: tokens.outline,
};

/**
 * A status chip: low-opacity fill, a hairline border in the same colour, and a
 * luminous 6px dot. Used for ticket state, node state, network state.
 */
export default function StatusChip({
  label,
  tone = 'neutral',
  sx,
}: {
  label: string;
  tone?: StatusTone;
  sx?: SxProps<Theme>;
}) {
  const color = TONES[tone];

  return (
    <Box
      component='span'
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.25,
          py: 0.5,
          borderRadius: '4px',
          border: `1px solid ${color}`,
          // A tint of the same hue rather than a solid fill, so the border reads
          // as the luminous element.
          bgcolor: `${color}1f`,
          color,
          ...monoLabelSx,
          whiteSpace: 'nowrap',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        component='span'
        sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: color,
          boxShadow: `0 0 8px ${color}`,
          flexShrink: 0,
        }}
      />
      {label}
    </Box>
  );
}

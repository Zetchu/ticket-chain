import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { FONT_DISPLAY, glassPanelSx, monoLabelSx, tokens } from '../theme';

/**
 * The glass panel used for every "nothing to show" state — empty lists,
 * unreachable node, wallet not connected. One component so the three read as
 * the same surface rather than three near-misses.
 */
export default function StatePanel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Box sx={{ ...glassPanelSx, p: { xs: 3, sm: 5 }, textAlign: 'center' }}>
      <Typography
        sx={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: '1.15rem',
          color: 'text.primary',
          mb: 1,
        }}
      >
        {title}
      </Typography>

      {description && (
        <Typography
          sx={{
            fontSize: '0.95rem',
            color: 'text.secondary',
            maxWidth: 480,
            mx: 'auto',
            mb: action || children ? 3 : 0,
          }}
        >
          {description}
        </Typography>
      )}

      {action}
      {children}
    </Box>
  );
}

/** A terminal-style command block, for setup instructions. */
export function CommandBlock({ children }: { children: string }) {
  return (
    <Box
      component='pre'
      sx={{
        display: 'inline-block',
        textAlign: 'left',
        bgcolor: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '4px',
        px: 2.5,
        py: 1.75,
        m: 0,
        ...monoLabelSx,
        fontSize: '0.8rem',
        color: tokens.violetBright,
        lineHeight: 1.8,
        overflowX: 'auto',
        maxWidth: '100%',
      }}
    >
      {children}
    </Box>
  );
}

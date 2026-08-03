import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { mutedSurface } from '../theme';

/**
 * The bordered panel used for every "nothing to show" state — empty lists,
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
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '16px',
        p: { xs: 3, sm: 5 },
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'text.primary', mb: 1 }}>
        {title}
      </Typography>

      {description && (
        <Typography
          sx={{
            fontSize: '0.9rem',
            color: 'text.secondary',
            maxWidth: 460,
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
      sx={(theme) => ({
        display: 'inline-block',
        textAlign: 'left',
        bgcolor: mutedSurface(theme.palette.mode),
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '10px',
        px: 2.5,
        py: 1.75,
        m: 0,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.82rem',
        color: 'text.primary',
        lineHeight: 1.7,
        overflowX: 'auto',
        maxWidth: '100%',
      })}
    >
      {children}
    </Box>
  );
}

import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { displayGlowSx } from '../theme';

/** The heading pair every page opens with. */
export default function PageHeader({
  title,
  subtitle,
  align = 'left',
  action,
}: {
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
  /** Optional control rendered opposite the title on wide screens. */
  action?: ReactNode;
}) {
  const isCentered = align === 'center';

  return (
    <Box
      sx={{
        mb: 5,
        display: 'flex',
        flexDirection: { xs: 'column', sm: isCentered ? 'column' : 'row' },
        alignItems: isCentered ? 'center' : { xs: 'flex-start', sm: 'flex-end' },
        justifyContent: 'space-between',
        gap: 2,
        textAlign: isCentered ? 'center' : 'left',
      }}
    >
      <Box>
        <Typography
          component='h2'
          sx={{
            ...displayGlowSx,
            fontSize: { xs: '1.75rem', md: '2.25rem' },
            color: 'text.primary',
            mb: subtitle ? 1.25 : 0,
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            sx={{
              fontSize: '0.98rem',
              color: 'text.secondary',
              maxWidth: 620,
              mx: isCentered ? 'auto' : 0,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>

      {action}
    </Box>
  );
}

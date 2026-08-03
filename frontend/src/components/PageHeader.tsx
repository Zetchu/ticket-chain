import { Box, Typography } from '@mui/material';

/** The heading pair every page opens with. */
export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography
        component='h2'
        sx={{
          fontSize: '1.5rem',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'text.primary',
          mb: subtitle ? 1 : 0,
        }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography sx={{ fontSize: '0.92rem', color: 'text.secondary', maxWidth: 560 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}

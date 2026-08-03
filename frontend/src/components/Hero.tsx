import { Box, Typography } from '@mui/material';

/** The masthead above the routed pages. */
export default function Hero() {
  return (
    <Box
      component='header'
      sx={{ textAlign: 'center', pt: { xs: 8, md: 12 }, pb: { xs: 6, md: 8 }, px: 2 }}
    >
      <Typography
        sx={{
          color: 'primary.main',
          fontSize: '0.95rem',
          fontWeight: 600,
          mb: 1.5,
        }}
      >
        TicketChain
      </Typography>
      <Typography
        variant='h1'
        sx={{
          fontSize: { xs: '2.5rem', md: '3.5rem' },
          color: 'text.primary',
          mb: 2,
        }}
      >
        Local, peer-to-peer,
        <br />
        impossible to scalp.
      </Typography>
      <Typography
        sx={{
          color: 'text.secondary',
          fontSize: { xs: '1rem', md: '1.15rem' },
          maxWidth: 520,
          mx: 'auto',
        }}
      >
        Every ticket is a verified on-chain asset with a price ceiling built in,
        sold once, resold at face value, never more.
      </Typography>
    </Box>
  );
}

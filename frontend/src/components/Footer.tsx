import { Box, Container, Link, Typography } from '@mui/material';
import { monoLabelSx, tokens } from '../theme';

const REPO_URL = 'https://github.com/Zetchu/ticket-chain';

export default function Footer() {
  return (
    <Box
      component='footer'
      sx={{
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(11, 11, 15, 0.6)',
        py: 3,
      }}
    >
      <Container
        maxWidth='lg'
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography sx={{ ...monoLabelSx, color: tokens.outline }}>
          © 2026 TicketChain Protocol · CS414
        </Typography>
        <Box sx={{ display: 'flex', gap: 3 }}>
          <Link
            href={REPO_URL}
            target='_blank'
            rel='noreferrer'
            sx={{
              ...monoLabelSx,
              color: tokens.outline,
              textDecoration: 'none',
              '&:hover': { color: tokens.violetBright },
            }}
          >
            Source
          </Link>
        </Box>
      </Container>
    </Box>
  );
}

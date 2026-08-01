import { useConnection } from 'wagmi';
import { useEffect, useMemo, useState } from 'react';
import { ThemeProvider, CssBaseline, Container, Box, Typography, type PaletteMode } from '@mui/material';
import Navbar from './components/Navbar';
import TicketGrid from './components/TicketGrid';
import { createAppTheme } from './theme';
import { ColorModeContext } from './ColorModeContext';

const STORAGE_KEY = 'ticketchain-color-mode';

function getInitialMode(): PaletteMode {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  // Fall back to the OS/browser preference on first visit.
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function App() {
  const { isConnected } = useConnection();
  const [mode, setMode] = useState<PaletteMode>(getInitialMode);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const colorMode = useMemo(
    () => ({
      mode,
      toggleMode: () => setMode((current) => (current === 'light' ? 'dark' : 'light')),
    }),
    [mode],
  );

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />

        <Navbar />

        <Box
          component='section'
          sx={{ textAlign: 'center', pt: { xs: 10, md: 14 }, pb: { xs: 8, md: 10 }, px: 2 }}
        >
          <Typography
            variant='h6'
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
            variant='body1'
            sx={{
              color: 'text.secondary',
              fontSize: '1.15rem',
              maxWidth: 520,
              mx: 'auto',
            }}
          >
            Every ticket is a verified on-chain asset with a price ceiling
            built in, sold once, resold at face value, never more.
          </Typography>
        </Box>

        <Container maxWidth='lg' sx={{ pb: 12 }}>
          <TicketGrid isConnected={isConnected} />
        </Container>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export default App;

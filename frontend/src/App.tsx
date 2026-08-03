import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Container, type PaletteMode } from '@mui/material';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import WrongNetworkBanner from './components/WrongNetworkBanner';
import BuyTicketsPage from './pages/BuyTicketsPage';
import MyTicketsPage from './pages/MyTicketsPage';
import OrganizerPage from './pages/OrganizerPage';
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

        <BrowserRouter>
          <Navbar />
          <WrongNetworkBanner />
          <Hero />

          <Container maxWidth='lg' sx={{ pb: 12 }}>
            <Routes>
              <Route path='/' element={<BuyTicketsPage />} />
              <Route path='/my-tickets' element={<MyTicketsPage />} />
              <Route path='/organizer' element={<OrganizerPage />} />
              {/* Any unknown path lands on the ticket list rather than a dead end. */}
              <Route path='*' element={<Navigate to='/' replace />} />
            </Routes>
          </Container>
        </BrowserRouter>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export default App;

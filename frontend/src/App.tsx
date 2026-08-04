import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Container, Box } from '@mui/material';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Footer from './components/Footer';
import WrongNetworkBanner from './components/WrongNetworkBanner';
import BuyTicketsPage from './pages/BuyTicketsPage';
import MyTicketsPage from './pages/MyTicketsPage';
import OrganizerPage from './pages/OrganizerPage';
import { createAppTheme } from './theme';

// Luminous Protocol is a dark-only system — see theme.ts.
const theme = createAppTheme();

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <BrowserRouter>
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Navbar />
          <WrongNetworkBanner />

          <Box component='main' sx={{ flexGrow: 1 }}>
            <Routes>
              {/* The masthead belongs to the marketplace, not to the wallet
                  and organizer views, which open straight into their content. */}
              <Route
                path='/'
                element={
                  <>
                    <Hero />
                    <Container maxWidth='lg' sx={{ pb: 12 }}>
                      <BuyTicketsPage />
                    </Container>
                  </>
                }
              />
              <Route
                path='/my-tickets'
                element={
                  <Container maxWidth='lg' sx={{ pt: { xs: 6, md: 10 }, pb: 12 }}>
                    <MyTicketsPage />
                  </Container>
                }
              />
              <Route
                path='/organizer'
                element={
                  <Container maxWidth='lg' sx={{ pt: { xs: 6, md: 10 }, pb: 12 }}>
                    <OrganizerPage />
                  </Container>
                }
              />
              {/* Any unknown path lands on the ticket list rather than a dead end. */}
              <Route path='*' element={<Navigate to='/' replace />} />
            </Routes>
          </Box>

          <Footer />
        </Box>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;

import { useConnection } from 'wagmi';
import { ThemeProvider, createTheme, CssBaseline, Container, Box, Typography } from '@mui/material';
import Navbar from './components/Navbar';
import TicketGrid from './components/TicketGrid';

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

const theme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#fbfbfd',
      paper: '#ffffff',
    },
    text: {
      primary: '#1d1d1f',
      secondary: '#6e6e73',
    },
    primary: {
      main: '#0071e3',
      dark: '#0058b0',
    },
    divider: '#d2d2d7',
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: FONT_STACK,
    h1: { fontWeight: 600, letterSpacing: '-0.03em' },
    h2: { fontWeight: 600, letterSpacing: '-0.02em' },
    h3: { fontWeight: 600, letterSpacing: '-0.02em' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
    body1: { letterSpacing: '-0.006em' },
    body2: { letterSpacing: '-0.006em' },
    button: { textTransform: 'none', fontWeight: 500, letterSpacing: '-0.006em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#fbfbfd',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 980, // Apple's pill-button radius
          boxShadow: 'none',
          padding: '9px 20px',
          fontSize: '0.9rem',
        },
        contained: {
          '&:hover': { boxShadow: 'none' },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

function App() {
  const { isConnected } = useConnection();

  return (
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
          Local, peer‑to‑peer,
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
          Every ticket is a verified on‑chain asset with a price ceiling
          built in — sold once, resold at face value, never more.
        </Typography>
      </Box>

      <Container maxWidth='lg' sx={{ pb: 12 }}>
        <TicketGrid isConnected={isConnected} />
      </Container>
    </ThemeProvider>
  );
}

export default App;

import { useConnection } from 'wagmi';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Container,
  Box,
  Typography,
} from '@mui/material';
import Navbar from './components/Navbar';
import TicketGrid from './components/TicketGrid';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0f172a',
      paper: '#1e293b',
    },
  },
});

function App() {
  const { isConnected } = useConnection();

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />

      <Navbar />

      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        }}
      >
        <Typography
          variant='h3'
          component='h1'
          gutterBottom
          sx={{ fontWeight: 800 }}
        >
          Local P2P Event Ticketing
        </Typography>
        <Typography
          variant='h6'
          color='text.secondary'
        >
          Secure, anti-scalping digital tickets verified on-chain.
        </Typography>
      </Box>

      <Container maxWidth='lg'>
        <TicketGrid isConnected={isConnected} />
      </Container>
    </ThemeProvider>
  );
}

export default App;

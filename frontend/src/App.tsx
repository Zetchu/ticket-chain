import { useConnection, useConnect, useDisconnect, useConnectors } from 'wagmi';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';

function App() {
  const { connect } = useConnect();
  const connectors = useConnectors();
  const { isConnected, address } = useConnection();
  const { disconnect } = useDisconnect();

  const metaMaskConnector = connectors.find(
    (c) => c.id === 'injected' || c.name === 'MetaMask',
  );

  if (isConnected) {
    return (
      <Container maxWidth='sm'>
        <Box sx={{ my: 4, textAlign: 'center' }}>
          <Typography
            variant='h4'
            component='h1'
            gutterBottom
          >
            P2P Event Ticketing
          </Typography>
          <Typography
            variant='body1'
            gutterBottom
          >
            Connected Wallet: {address}
          </Typography>
          <Button
            variant='outlined'
            color='error'
            onClick={() => disconnect()}
          >
            Disconnect
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth='sm'>
      <Box sx={{ my: 4, textAlign: 'center' }}>
        <Typography
          variant='h4'
          component='h1'
          gutterBottom
        >
          P2P Event Ticketing
        </Typography>
        {metaMaskConnector ? (
          <Button
            variant='contained'
            onClick={() => connect({ connector: metaMaskConnector })}
          >
            Connect MetaMask
          </Button>
        ) : (
          <Typography color='error'>
            MetaMask not found. Please install the browser extension.
          </Typography>
        )}
      </Box>
    </Container>
  );
}

export default App;

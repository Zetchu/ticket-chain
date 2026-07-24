import { useConnection, useConnect, useDisconnect, useConnectors } from 'wagmi';
import { AppBar, Toolbar, Typography, Button, Box, Chip } from '@mui/material';

export default function Navbar() {
  const { connect } = useConnect();
  const connectors = useConnectors();
  const { isConnected, address } = useConnection();
  const { disconnect } = useDisconnect();

  const metaMaskConnector = connectors.find(
    (c) => c.id === 'injected' || c.name === 'MetaMask',
  );

  return (
    <AppBar
      position='static'
      color='transparent'
      elevation={0}
      sx={{ borderBottom: '1px solid #334155' }}
    >
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        <Typography
          variant='h6'
          sx={{ fontWeight: 800, color: 'white' }}
        >
          TicketChain.
        </Typography>
        <Box>
          {isConnected ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Chip
                label={`${address?.slice(0, 6)}...${address?.slice(-4)}`}
                sx={{
                  bgcolor: '#1e293b',
                  color: 'white',
                  fontFamily: 'monospace',
                }}
              />
              <Button
                variant='outlined'
                color='error'
                onClick={() => disconnect()}
              >
                Disconnect
              </Button>
            </Box>
          ) : metaMaskConnector ? (
            <Button
              variant='contained'
              onClick={() => connect({ connector: metaMaskConnector })}
            >
              Connect MetaMask
            </Button>
          ) : (
            <Typography color='error'>MetaMask not installed</Typography>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}

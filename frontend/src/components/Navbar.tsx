// src/components/Navbar.tsx
import { useConnection, useConnect, useDisconnect, useConnectors } from 'wagmi';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';

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
      position='sticky'
      color='transparent'
      elevation={0}
      sx={{
        backgroundColor: 'rgba(251, 251, 253, 0.8)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Toolbar
        sx={{ justifyContent: 'space-between', minHeight: '52px !important', px: { xs: 2, sm: 3 } }}
      >
        <Typography
          sx={{ fontWeight: 600, fontSize: '0.95rem', color: 'text.primary', letterSpacing: '-0.01em' }}
        >
          TicketChain
        </Typography>

        {isConnected ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: '#30d158',
                }}
              />
              <Typography
                sx={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: '0.82rem',
                  color: 'text.secondary',
                }}
              >
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </Typography>
            </Box>
            <Button
              size='small'
              onClick={() => disconnect()}
              sx={{
                color: 'text.secondary',
                minWidth: 'auto',
                px: 1.5,
                '&:hover': { color: '#ff3b30', backgroundColor: 'transparent' },
              }}
            >
              Sign out
            </Button>
          </Box>
        ) : metaMaskConnector ? (
          <Button
            variant='contained'
            disableElevation
            onClick={() => connect({ connector: metaMaskConnector })}
            sx={{
              bgcolor: 'text.primary',
              '&:hover': { bgcolor: '#000000' },
            }}
          >
            Connect Wallet
          </Button>
        ) : (
          <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
            MetaMask not installed
          </Typography>
        )}
      </Toolbar>
    </AppBar>
  );
}

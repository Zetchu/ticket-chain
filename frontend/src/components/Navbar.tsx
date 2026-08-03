// src/components/Navbar.tsx
import { useConnection, useConnect, useDisconnect, useConnectors } from 'wagmi';
import { AppBar, Toolbar, Typography, Button, IconButton, Box } from '@mui/material';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import { NavLink, Link as RouterLink } from 'react-router-dom';
import { useColorMode } from '../ColorModeContext';
import { truncateAddress } from '../lib/format';

const PAGES = [
  { to: '/', label: 'Buy Tickets' },
  { to: '/my-tickets', label: 'My Tickets' },
] as const;

export default function Navbar() {
  const { mutate: connect, isPending: isConnecting } = useConnect();
  const connectors = useConnectors();
  const { isConnected, address } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const { mode, toggleMode } = useColorMode();

  const metaMaskConnector = connectors.find(
    (c) => c.id === 'injected' || c.name === 'MetaMask',
  );

  return (
    <AppBar
      position='sticky'
      color='transparent'
      elevation={0}
      sx={(theme) => ({
        backgroundColor:
          theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.72)' : 'rgba(251, 251, 253, 0.8)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid',
        borderColor: 'divider',
      })}
    >
      <Toolbar
        sx={{
          justifyContent: 'space-between',
          minHeight: '52px !important',
          px: { xs: 2, sm: 3 },
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 2, sm: 3.5 }, minWidth: 0 }}>
          <Typography
            component={RouterLink}
            to='/'
            sx={{
              fontWeight: 600,
              fontSize: '0.95rem',
              color: 'text.primary',
              letterSpacing: '-0.01em',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            TicketChain
          </Typography>

          <Box component='nav' sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2.5 } }}>
            {PAGES.map((page) => (
              <NavLink key={page.to} to={page.to} end style={{ textDecoration: 'none' }}>
                {({ isActive }) => (
                  <Typography
                    sx={{
                      fontSize: '0.85rem',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'text.primary' : 'text.secondary',
                      whiteSpace: 'nowrap',
                      transition: 'color 0.15s ease',
                      '&:hover': { color: 'text.primary' },
                    }}
                  >
                    {page.label}
                  </Typography>
                )}
              </NavLink>
            ))}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
          <IconButton
            size='small'
            onClick={toggleMode}
            aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            sx={{ color: 'text.secondary' }}
          >
            {mode === 'dark' ? (
              <LightModeOutlinedIcon fontSize='small' />
            ) : (
              <DarkModeOutlinedIcon fontSize='small' />
            )}
          </IconButton>

          {isConnected ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main' }} />
                <Typography
                  title={address}
                  sx={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: '0.82rem',
                    color: 'text.secondary',
                    display: { xs: 'none', sm: 'block' },
                  }}
                >
                  {truncateAddress(address)}
                </Typography>
              </Box>
              <Button
                size='small'
                onClick={() => disconnect()}
                sx={{
                  color: 'text.secondary',
                  minWidth: 'auto',
                  px: 1.5,
                  '&:hover': { color: 'error.main', backgroundColor: 'transparent' },
                }}
              >
                Sign out
              </Button>
            </Box>
          ) : metaMaskConnector ? (
            <Button
              variant='contained'
              disableElevation
              disabled={isConnecting}
              onClick={() => connect({ connector: metaMaskConnector })}
              sx={{
                bgcolor: 'text.primary',
                color: 'background.default',
                '&:hover': { bgcolor: 'text.primary', opacity: 0.85 },
              }}
            >
              {isConnecting ? 'Connecting…' : 'Connect Wallet'}
            </Button>
          ) : (
            <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
              MetaMask not installed
            </Typography>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}

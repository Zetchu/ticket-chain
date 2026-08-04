// src/components/Navbar.tsx
import { useConnection, useConnect, useDisconnect, useConnectors } from 'wagmi';
import { AppBar, Toolbar, Typography, Button, Box, Tooltip } from '@mui/material';
import { NavLink, Link as RouterLink } from 'react-router-dom';
import { hardhat } from 'wagmi/chains';
import { truncateAddress } from '../lib/format';
import { ctaButtonSx, FONT_DISPLAY, monoLabelSx, tokens } from '../theme';

const PAGES = [
  { to: '/', label: 'Buy Tickets' },
  { to: '/my-tickets', label: 'My Tickets' },
  { to: '/organizer', label: 'Organizer' },
] as const;

export default function Navbar() {
  const { mutate: connect, isPending: isConnecting } = useConnect();
  const connectors = useConnectors();
  const { isConnected, address, chainId } = useConnection();
  const { mutate: disconnect } = useDisconnect();

  const metaMaskConnector = connectors.find(
    (c) => c.id === 'injected' || c.name === 'MetaMask',
  );

  return (
    <AppBar
      position='sticky'
      color='transparent'
      elevation={0}
      sx={{
        background: 'rgba(11, 11, 15, 0.72)',
        backdropFilter: 'saturate(160%) blur(40px)',
        WebkitBackdropFilter: 'saturate(160%) blur(40px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <Toolbar
        sx={{
          justifyContent: 'space-between',
          minHeight: { xs: 60, sm: 68 },
          px: { xs: 2, sm: 3 },
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 2, md: 4 }, minWidth: 0 }}>
          <Box
            component={RouterLink}
            to='/'
            sx={{ display: 'flex', alignItems: 'center', gap: 1.25, textDecoration: 'none' }}
          >
            <BrandMark />
            <Typography
              sx={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: '1.15rem',
                letterSpacing: '-0.02em',
                color: 'text.primary',
                textShadow: '0 0 18px rgba(153, 69, 255, 0.45)',
                display: { xs: 'none', sm: 'block' },
              }}
            >
              TicketChain
            </Typography>
          </Box>

          <Box
            component='nav'
            sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 3 } }}
          >
            {PAGES.map((page) => (
              <NavLink key={page.to} to={page.to} end style={{ textDecoration: 'none' }}>
                {({ isActive }) => (
                  <Typography
                    sx={{
                      ...monoLabelSx,
                      textTransform: 'uppercase',
                      color: isActive ? tokens.violetBright : tokens.outline,
                      borderBottom: '1px solid',
                      borderColor: isActive ? tokens.violet : 'transparent',
                      pb: 0.5,
                      whiteSpace: 'nowrap',
                      transition: 'color 0.15s ease, border-color 0.15s ease',
                      '&:hover': { color: tokens.onSurface },
                    }}
                  >
                    {page.label}
                  </Typography>
                )}
              </NavLink>
            ))}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {isConnected ? (
            <>
              <WalletChip address={address} chainId={chainId} />
              <Button
                onClick={() => disconnect()}
                sx={{
                  ...monoLabelSx,
                  textTransform: 'uppercase',
                  color: tokens.outline,
                  minWidth: 'auto',
                  px: 1.5,
                  '&:hover': { color: tokens.error, bgcolor: 'transparent' },
                }}
              >
                Sign out
              </Button>
            </>
          ) : metaMaskConnector ? (
            <Button
              variant='contained'
              disabled={isConnecting}
              onClick={() => connect({ connector: metaMaskConnector })}
              sx={ctaButtonSx(false, isConnecting)}
            >
              {isConnecting ? 'Connecting…' : 'Connect Wallet'}
            </Button>
          ) : (
            <Typography sx={{ ...monoLabelSx, color: tokens.error }}>
              MetaMask not installed
            </Typography>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}

/** Wallet connector: mono address plus a network-status indicator. */
function WalletChip({ address, chainId }: { address?: string; chainId?: number }) {
  const isExpectedNetwork = chainId === hardhat.id;
  const indicator = isExpectedNetwork ? tokens.cyan : tokens.orange;

  return (
    <Tooltip
      title={
        isExpectedNetwork
          ? `${address} · Hardhat local (${hardhat.id})`
          : `${address} · wrong network (${chainId ?? 'unknown'})`
      }
      placement='bottom-end'
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: '4px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          bgcolor: 'rgba(0, 0, 0, 0.3)',
        }}
      >
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: indicator,
            boxShadow: `0 0 8px ${indicator}`,
          }}
        />
        <Typography sx={{ ...monoLabelSx, color: 'text.primary' }}>
          {truncateAddress(address)}
        </Typography>
      </Box>
    </Tooltip>
  );
}

/** A chain-link glyph in the brand violet, glowing against the void. */
function BrandMark() {
  return (
    <Box
      sx={{
        width: 30,
        height: 30,
        display: 'grid',
        placeItems: 'center',
        borderRadius: '8px',
        border: '1px solid rgba(153, 69, 255, 0.5)',
        background: 'linear-gradient(135deg, rgba(153, 69, 255, 0.35), rgba(153, 69, 255, 0.05))',
        boxShadow: '0 0 18px rgba(153, 69, 255, 0.35)',
        flexShrink: 0,
      }}
    >
      <Box
        component='svg'
        viewBox='0 0 24 24'
        aria-hidden
        sx={{ width: 16, height: 16, fill: 'none', stroke: tokens.violetBright, strokeWidth: 2 }}
      >
        <path
          d='M9.5 14.5 14.5 9.5M8 12l-1.8 1.8a3.4 3.4 0 0 0 4.8 4.8L12.8 17M11.2 7l1.8-1.8a3.4 3.4 0 0 1 4.8 4.8L16 11.8'
          strokeLinecap='round'
        />
      </Box>
    </Box>
  );
}

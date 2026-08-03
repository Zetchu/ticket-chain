import { Alert, Button, Container } from '@mui/material';
import { useConnection, useSwitchChain } from 'wagmi';
import { hardhat } from 'wagmi/chains';

/**
 * A wallet pointed at the wrong chain reads no ticket state and every write
 * fails, with nothing on screen explaining why. Say so, and offer the switch.
 */
export default function WrongNetworkBanner() {
  const { isConnected, chainId } = useConnection();
  const { mutate: switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === hardhat.id) return null;

  return (
    <Container maxWidth='lg' sx={{ pt: 3 }}>
      <Alert
        severity='warning'
        variant='outlined'
        sx={{ bgcolor: 'background.paper', alignItems: 'center' }}
        action={
          <Button
            size='small'
            disabled={isPending}
            onClick={() => switchChain({ chainId: hardhat.id })}
            sx={{ color: 'text.primary', whiteSpace: 'nowrap' }}
          >
            {isPending ? 'Switching…' : 'Switch network'}
          </Button>
        }
      >
        Your wallet is on the wrong network. TicketChain runs on the local
        Hardhat chain (ID {hardhat.id}).
      </Alert>
    </Container>
  );
}

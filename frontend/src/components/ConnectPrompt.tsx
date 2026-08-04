import { Button } from '@mui/material';
import { useConnect, useConnectors } from 'wagmi';
import StatePanel from './StatePanel';
import { ctaButtonSx } from '../theme';

/** Shown where a page needs a wallet that isn't connected yet. */
export default function ConnectPrompt({ message }: { message: string }) {
  const { mutate: connect, isPending } = useConnect();
  const connectors = useConnectors();
  const injectedConnector = connectors.find(
    (connector) => connector.id === 'injected' || connector.name === 'MetaMask',
  );

  return (
    <StatePanel
      title='Wallet not connected'
      description={message}
      action={
        injectedConnector ? (
          <Button
            variant='contained'
            disableElevation
            disabled={isPending}
            onClick={() => connect({ connector: injectedConnector })}
            sx={{ ...ctaButtonSx(false, isPending), px: 3, width: 'auto' }}
          >
            {isPending ? 'Connecting…' : 'Connect Wallet'}
          </Button>
        ) : undefined
      }
    />
  );
}

import StatePanel, { CommandBlock } from './StatePanel';
import { isLocalHost } from '../hooks/useTicketBoard';
import { readableError } from '../lib/format';

const REPO_URL = 'https://github.com/Zetchu/ticket-chain.git';

/**
 * What to say when the ticket feed can't be reached.
 *
 * On localhost that's a real fault — the node isn't running. On a hosted build
 * it's expected: the P2P node and chain live on the visitor's own machine, so
 * there is nothing to reach, and the honest answer is setup instructions.
 */
export default function FeedErrorPanel({ error }: { error: unknown }) {
  if (isLocalHost) {
    return (
      <StatePanel
        title="Can't reach the local network"
        description={`Make sure the PyIPv8 node is running on port 8080. (${readableError(error)})`}
      />
    );
  }

  return (
    <StatePanel
      title='This demo runs on your local network'
      description='TicketChain discovers tickets over a peer-to-peer overlay and a local blockchain node, both of which run on your own machine — not on this hosted page. Run the project locally to see live ticket data and complete a purchase.'
    >
      <CommandBlock>
        {`git clone ${REPO_URL}\ncd ticket-chain && ./start_dev.sh`}
      </CommandBlock>
    </StatePanel>
  );
}

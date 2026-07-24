import './App.css';
import { useConnection, useConnect, useDisconnect, useConnectors } from 'wagmi';

const MOCK_TICKETS = [
  {
    id: 1,
    title: 'Sónar Festival 2026',
    date: 'June 2026',
    location: 'Fira Montjuïc, Barcelona',
    price: '150 USDC',
    type: '3-Day Pass',
  },
  {
    id: 2,
    title: 'Mobile World Congress',
    date: 'March 2026',
    location: 'Fira Gran Via, Barcelona',
    price: '850 USDC',
    type: 'Standard Entry',
  },
  {
    id: 3,
    title: 'Talent Arena',
    date: 'March 2026',
    location: 'Fira Montjuïc, Barcelona',
    price: 'Face Value',
    type: 'Developer Pass',
  },
];

function App() {
  const { connect } = useConnect();
  const connectors = useConnectors();
  const { isConnected, address } = useConnection();
  const { disconnect } = useDisconnect();

  const metaMaskConnector = connectors.find(
    (c) => c.id === 'injected' || c.name === 'MetaMask',
  );

  return (
    <div className='app-container'>
      {/* Navigation Bar */}
      <nav className='navbar'>
        <div className='logo'>TicketChain.</div>
        <div className='wallet-section'>
          {isConnected ? (
            <div className='connected-status'>
              <span className='address-badge'>
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <button
                className='btn-danger'
                onClick={() => disconnect()}
              >
                Disconnect
              </button>
            </div>
          ) : metaMaskConnector ? (
            <button
              className='btn-primary'
              onClick={() => connect({ connector: metaMaskConnector })}
            >
              Connect MetaMask
            </button>
          ) : (
            <span className='warning-text'>MetaMask not installed</span>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <header className='hero'>
        <h1>Local P2P Event Ticketing</h1>
        <p>Secure, anti-scalping digital tickets verified on-chain.</p>
      </header>

      {/* Ticket Grid */}
      <main className='content'>
        <h2>Available Events</h2>
        <div className='ticket-grid'>
          {MOCK_TICKETS.map((ticket) => (
            <div
              key={ticket.id}
              className='ticket-card'
            >
              <div className='ticket-header'>
                <span className='ticket-type'>{ticket.type}</span>
                <span className='ticket-price'>{ticket.price}</span>
              </div>
              <h3 className='ticket-title'>{ticket.title}</h3>
              <div className='ticket-details'>
                <p>📍 {ticket.location}</p>
                <p>📅 {ticket.date}</p>
              </div>
              <button
                className='btn-action'
                disabled={!isConnected}
                title={!isConnected ? 'Connect wallet to purchase' : ''}
              >
                {isConnected ? 'Purchase Ticket' : 'Connect to Buy'}
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;

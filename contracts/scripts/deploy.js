const fs = require("fs");
const path = require("path");
const { ethers, artifacts, network } = require("hardhat");

// Where the frontend picks up the ABI + deployed address.
const FRONTEND_CONTRACTS_DIR = path.join(__dirname, "..", "..", "frontend", "src", "contracts");

// Tickets minted at deploy time so the local demo has something to read.
// getTicketDetails reverts for a nonexistent token, so without these every
// card in the UI would render an error. Keep in sync with the --seed count
// passed to the P2P node in start_dev.sh: the P2P feed lists token IDs
// 0..N-1, and each card calls the contract with that ID.
const SEED_COUNT = Number(process.env.TICKET_SEED_COUNT ?? 3);

async function main() {
  const ticket = await ethers.deployContract("TicketNFT");
  await ticket.waitForDeployment();
  const address = await ticket.getAddress();
  console.log(`TicketNFT deployed to: ${address} (network: ${network.name})`);

  await seedTickets(ticket);
  exportAbi(address);
}

// Mint the seed tickets to account #1, not the deployer. Account #0 is the
// organizer and the account most people import into MetaMask first —
// resaleTransfer rejects buying your own ticket, so holding the seed tickets
// on a different account keeps the purchase flow clickable out of the box.
async function seedTickets(ticket) {
  if (SEED_COUNT <= 0) return;

  const signers = await ethers.getSigners();
  const holder = signers[1] ?? signers[0];

  for (let i = 0; i < SEED_COUNT; i++) {
    const tx = await ticket.mintTicket(holder.address);
    await tx.wait();
  }
  console.log(
    `Minted ${SEED_COUNT} ticket(s) (token IDs 0..${SEED_COUNT - 1}) to ${holder.address}`
  );
}

function exportAbi(address) {
  const artifact = artifacts.readArtifactSync("TicketNFT");

  fs.mkdirSync(FRONTEND_CONTRACTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(FRONTEND_CONTRACTS_DIR, "TicketNFT.json"),
    JSON.stringify(
      {
        contractName: artifact.contractName,
        network: network.name,
        address,
        abi: artifact.abi,
      },
      null,
      2
    )
  );
  console.log(`ABI + address exported to ${path.join(FRONTEND_CONTRACTS_DIR, "TicketNFT.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const fs = require("fs");
const path = require("path");
const { ethers, artifacts, network } = require("hardhat");

// Where the frontend picks up the ABI + deployed address.
const FRONTEND_CONTRACTS_DIR = path.join(__dirname, "..", "..", "frontend", "src", "contracts");

async function main() {
  const ticket = await ethers.deployContract("TicketNFT");
  await ticket.waitForDeployment();
  const address = await ticket.getAddress();
  console.log(`TicketNFT deployed to: ${address} (network: ${network.name})`);

  exportAbi(address);
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

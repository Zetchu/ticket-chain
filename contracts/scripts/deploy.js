const { ethers } = require("hardhat");

async function main() {
  const ticket = await ethers.deployContract("TicketNFT");
  await ticket.waitForDeployment();
  console.log(`TicketNFT deployed to: ${await ticket.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Rainy Day live-demo script: a scalper attempts to buy a ticket above face
// value directly against the contract (bypassing the UI, which never lets a
// user submit anything but the exact face-value price — see
// frontend/src/components/TicketCard.tsx's handlePurchase). This is how the
// attack actually has to be attempted in real life: a raw contract call with
// a marked-up msg.value. TicketNFT.resaleTransfer rejects it with "Scalping
// detected: Price exceeds face value" and the whole transaction reverts.
//
// Usage (against the running dev environment — see docs/demo-scenarios.md):
//   cd contracts
//   npx hardhat run scripts/demo-rainy-day.js --network localhost

const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const FRONTEND_CONTRACT_JSON = path.join(
  __dirname, "..", "..", "frontend", "src", "contracts", "TicketNFT.json"
);
const TOKEN_ID = Number(process.env.TICKET_ID ?? 0);
// A scalper marking the ticket up 3x face value.
const MARKUP_MULTIPLIER = 3n;

async function main() {
  const { address } = JSON.parse(fs.readFileSync(FRONTEND_CONTRACT_JSON, "utf8"));
  const ticket = await ethers.getContractAt("TicketNFT", address);

  // signers[0] = organizer, signers[1] = seed ticket holder (see deploy.js),
  // signers[2] = our scalper for this demo — must not already own the ticket.
  const [, , scalper] = await ethers.getSigners();

  const faceValue = await ticket.FACE_VALUE();
  const scalperPrice = faceValue * MARKUP_MULTIPLIER;
  const ownerBefore = await ticket.ownerOf(TOKEN_ID);

  console.log(`Contract:        ${address}`);
  console.log(`Ticket #${TOKEN_ID} owned by: ${ownerBefore}`);
  console.log(`Face value:      ${ethers.formatEther(faceValue)} ETH`);
  console.log(`Scalper offers:  ${ethers.formatEther(scalperPrice)} ETH (from ${scalper.address})`);
  console.log("");
  console.log("Submitting resaleTransfer() at the marked-up price...");

  try {
    const tx = await ticket.connect(scalper).resaleTransfer(TOKEN_ID, { value: scalperPrice });
    await tx.wait();
    console.log("UNEXPECTED: transaction succeeded — anti-scalping check did not fire!");
    process.exitCode = 1;
  } catch (err) {
    console.log("REVERTED as expected:");
    console.log(`  reason: ${err.shortMessage ?? err.message}`);
  }

  const ownerAfter = await ticket.ownerOf(TOKEN_ID);
  console.log("");
  console.log(`Ticket #${TOKEN_ID} owner unchanged: ${ownerAfter === ownerBefore ? "YES" : "NO (!)"}`);
  if (ownerAfter !== ownerBefore) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

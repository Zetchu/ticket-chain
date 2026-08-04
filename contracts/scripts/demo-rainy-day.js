// Rainy Day live-demo script: two ways to attempt scalping, both refused by
// TicketNFT. Neither can be attempted through the UI — the listing form caps
// the price at face value and the buy button always sends exactly the listed
// price — so a real scalper has to go around the frontend and call the
// contract directly. That is what this script does.
//
//   1. The holder tries to LIST above face value.
//      → reverted: "Scalping detected: Price exceeds face value"
//   2. A buyer tries to PAY more than the listed price.
//      → reverted: "Payment must equal the listed price"
//
// The two checks live at different points in the lifecycle on purpose: the
// ceiling is enforced when the offer is made, so an over-priced ticket can
// never even be advertised, and the payment check then pins the sale to that
// advertised price in both directions.
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
  const signers = await ethers.getSigners();

  const faceValue = await ticket.FACE_VALUE();
  const scalperPrice = faceValue * MARKUP_MULTIPLIER;
  const ownerBefore = await ticket.ownerOf(TOKEN_ID);
  const [listedPriceBefore] = await ticket.listings(TOKEN_ID);

  console.log(`Contract:        ${address}`);
  console.log(`Ticket #${TOKEN_ID} owned by: ${ownerBefore}`);
  console.log(`Face value:      ${ethers.formatEther(faceValue)} ETH`);
  console.log(`Listed at:       ${ethers.formatEther(listedPriceBefore)} ETH`);
  console.log(`Markup attempt:  ${ethers.formatEther(scalperPrice)} ETH (3x face value)`);

  await attemptScalpedListing(ticket, signers, ownerBefore, scalperPrice);
  await attemptOverpayment(ticket, signers, ownerBefore, scalperPrice);

  const ownerAfter = await ticket.ownerOf(TOKEN_ID);
  const [listedPriceAfter] = await ticket.listings(TOKEN_ID);

  console.log("");
  console.log(`Ticket #${TOKEN_ID} owner unchanged:   ${ownerAfter === ownerBefore ? "YES" : "NO (!)"}`);
  console.log(
    `Ticket #${TOKEN_ID} listing unchanged: ` +
      `${listedPriceAfter === listedPriceBefore ? "YES" : "NO (!)"} ` +
      `(${ethers.formatEther(listedPriceAfter)} ETH)`
  );
  if (ownerAfter !== ownerBefore || listedPriceAfter !== listedPriceBefore) {
    process.exitCode = 1;
  }
}

/** Attempt 1: the holder advertises the ticket above its face value. */
async function attemptScalpedListing(ticket, signers, ownerBefore, scalperPrice) {
  console.log("");
  console.log("[1] Holder submits listForSale() above face value...");

  const holder = signers.find((s) => s.address === ownerBefore);
  if (!holder) {
    console.log("    skipped: ticket holder is not a local signer");
    return;
  }

  try {
    await (await ticket.connect(holder).listForSale(TOKEN_ID, scalperPrice)).wait();
    console.log("    UNEXPECTED: listing succeeded — the price ceiling did not fire!");
    process.exitCode = 1;
  } catch (err) {
    console.log(`    REVERTED as expected: ${reasonOf(err)}`);
  }
}

/** Attempt 2: a buyer pays more than the advertised price. */
async function attemptOverpayment(ticket, signers, ownerBefore, scalperPrice) {
  console.log("");
  console.log("[2] Buyer submits resaleTransfer() with a marked-up msg.value...");

  // Any account that does not already hold the ticket — the contract rejects
  // buying from yourself before it ever looks at the payment.
  const buyer = signers.find((s) => s.address !== ownerBefore);
  console.log(`    buyer: ${buyer.address}`);

  try {
    await (
      await ticket.connect(buyer).resaleTransfer(TOKEN_ID, { value: scalperPrice })
    ).wait();
    console.log("    UNEXPECTED: purchase succeeded — the payment check did not fire!");
    process.exitCode = 1;
  } catch (err) {
    console.log(`    REVERTED as expected: ${reasonOf(err)}`);
  }
}

/** The revert reason, without the surrounding EVM exception noise. */
function reasonOf(err) {
  const message = err.shortMessage ?? err.message;
  const quoted = message.match(/'([^']+)'/);
  return quoted ? quoted[1] : message;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

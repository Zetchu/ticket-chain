// Rainy-day companion to demo-rainy-day.js: the two guards that stop a bulk
// buyer and a stale ticket, rather than a scalper's price.
//
//   1. A single wallet tries to buy more of the primary sale than the
//      organizer allowed  → "Primary purchase limit reached for this event"
//   2. Anyone tries to trade a ticket whose event has already started
//      → "Event has already started"
//
// Usage (against the running dev environment — see docs/demo-scenarios.md):
//   cd contracts
//   npx hardhat run scripts/demo-limits.js --network localhost

const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const FRONTEND_CONTRACT_JSON = path.join(
  __dirname, "..", "..", "frontend", "src", "contracts", "TicketNFT.json"
);
const reasonOf = (err) => {
  const message = err.shortMessage ?? err.message;
  return message.match(/'([^']+)'/)?.[1] ?? message;
};

async function main() {
  const { address } = JSON.parse(fs.readFileSync(FRONTEND_CONTRACT_JSON, "utf8"));
  const ticket = await ethers.getContractAt("TicketNFT", address);
  const [, bulkBuyer, otherBuyer] = await ethers.getSigners();

  const price = ethers.parseEther("0.05");
  const startsSoon = Math.floor(Date.now() / 1000) + 60;
  const startsLater = Math.floor(Date.now() / 1000) + 86400 * 30;

  console.log(`Contract: ${address}`);
  console.log("");
  console.log("[1] Organizer mints 3 tickets with a limit of 1 per wallet...");
  const capped = await ticket.mintAndList(3, "Capped Show", startsLater, "", price, 1);
  await capped.wait();
  const firstCapped = Number(await ticket.totalMinted()) - 3;

  await (await ticket.connect(bulkBuyer).resaleTransfer(firstCapped, { value: price })).wait();
  console.log(`    buyer takes #${firstCapped}: ok`);
  try {
    await ticket.connect(bulkBuyer).resaleTransfer(firstCapped + 1, { value: price });
    console.log("    UNEXPECTED: the same wallet bought a second ticket!");
    process.exitCode = 1;
  } catch (err) {
    console.log(`    same wallet tries #${firstCapped + 1}: REVERTED — ${reasonOf(err)}`);
  }
  await (await ticket.connect(otherBuyer).resaleTransfer(firstCapped + 1, { value: price })).wait();
  console.log(`    a different wallet takes #${firstCapped + 1}: ok — the cap is per address`);

  console.log("");
  console.log("[2] Organizer mints a ticket for an event that then starts...");
  await (await ticket.mintAndList(1, "Doors Already Open", startsSoon, "", price, 0)).wait();
  const expiring = Number(await ticket.totalMinted()) - 1;
  await ethers.provider.send("evm_increaseTime", [3600]);
  await ethers.provider.send("evm_mine", []);
  console.log("    (chain time advanced past the event start)");

  try {
    await ticket.connect(bulkBuyer).resaleTransfer(expiring, { value: price });
    console.log("    UNEXPECTED: an expired ticket was sold!");
    process.exitCode = 1;
  } catch (err) {
    console.log(`    buying #${expiring}:  REVERTED — ${reasonOf(err)}`);
  }
  try {
    await ticket.listForSale(expiring, price);
    console.log("    UNEXPECTED: an expired ticket was listed!");
    process.exitCode = 1;
  } catch (err) {
    console.log(`    listing #${expiring}: REVERTED — ${reasonOf(err)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

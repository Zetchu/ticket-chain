const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { ethers } = require("hardhat");

describe("TicketNFT", function () {
  async function deployFixture() {
    const [organizer, alice, bob] = await ethers.getSigners();
    const TicketNFT = await ethers.getContractFactory("TicketNFT");
    const ticket = await TicketNFT.deploy();
    return { ticket, organizer, alice, bob };
  }

  describe("Minting", function () {
    it("lets the organizer mint a ticket to an attendee", async function () {
      const { ticket, alice } = await loadFixture(deployFixture);
      await expect(ticket.mintTicket(alice.address))
        .to.emit(ticket, "TicketMinted")
        .withArgs(alice.address, 0, await ticket.FACE_VALUE());
      expect(await ticket.ownerOf(0)).to.equal(alice.address);
    });

    it("records the hard-coded face value for the minted ticket", async function () {
      const { ticket, alice } = await loadFixture(deployFixture);
      await ticket.mintTicket(alice.address);
      expect(await ticket.faceValueOf(0)).to.equal(ethers.parseEther("0.05"));
    });

    it("rejects minting from a non-organizer account", async function () {
      const { ticket, alice, bob } = await loadFixture(deployFixture);
      await expect(ticket.connect(alice).mintTicket(bob.address))
        .to.be.revertedWithCustomError(ticket, "OwnableUnauthorizedAccount");
    });
  });

  describe("Transfers (anti-scalping stub)", function () {
    it("allows a peer transfer at or below face value", async function () {
      const { ticket, alice, bob } = await loadFixture(deployFixture);
      await ticket.mintTicket(alice.address);
      const faceValue = await ticket.FACE_VALUE();
      await expect(ticket.connect(alice).transferTicket(bob.address, 0, faceValue))
        .to.emit(ticket, "TicketTransferred")
        .withArgs(alice.address, bob.address, 0, faceValue);
      expect(await ticket.ownerOf(0)).to.equal(bob.address);
    });

    it("reverts when the sale price exceeds the face value (rainy day)", async function () {
      const { ticket, alice, bob } = await loadFixture(deployFixture);
      await ticket.mintTicket(alice.address);
      const scalperPrice = (await ticket.FACE_VALUE()) + 1n;
      await expect(
        ticket.connect(alice).transferTicket(bob.address, 0, scalperPrice)
      ).to.be.revertedWith("TicketNFT: price exceeds face value");
    });

    it("reverts when the sender does not own the ticket", async function () {
      const { ticket, alice, bob } = await loadFixture(deployFixture);
      await ticket.mintTicket(alice.address);
      await expect(
        ticket.connect(bob).transferTicket(bob.address, 0, 0)
      ).to.be.revertedWithCustomError(ticket, "ERC721InsufficientApproval");
    });
  });
});

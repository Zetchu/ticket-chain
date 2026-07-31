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

  async function mintedFixture() {
    const state = await deployFixture();
    await state.ticket.mintTicket(state.alice.address);
    return state;
  }

  describe("Minting", function () {
    it("lets the organizer mint a ticket to an attendee", async function () {
      const { ticket, alice } = await loadFixture(deployFixture);
      await expect(ticket.mintTicket(alice.address))
        .to.emit(ticket, "TicketMinted")
        .withArgs(alice.address, 0, await ticket.FACE_VALUE());
      expect(await ticket.ownerOf(0)).to.equal(alice.address);
    });

    it("stores face value and resellable flag in the Ticket struct", async function () {
      const { ticket } = await loadFixture(mintedFixture);
      const [faceValue, isResellable] = await ticket.tickets(0);
      expect(faceValue).to.equal(ethers.parseEther("0.05"));
      expect(isResellable).to.equal(true);
    });

    it("rejects minting from a non-organizer account", async function () {
      const { ticket, alice, bob } = await loadFixture(deployFixture);
      await expect(ticket.connect(alice).mintTicket(bob.address))
        .to.be.revertedWithCustomError(ticket, "OwnableUnauthorizedAccount");
    });
  });

  describe("getTicketDetails", function () {
    it("returns the face-value price of an existing ticket", async function () {
      const { ticket } = await loadFixture(mintedFixture);
      expect(await ticket.getTicketDetails(0)).to.equal(ethers.parseEther("0.05"));
    });

    it("reverts for a nonexistent ticket", async function () {
      const { ticket } = await loadFixture(deployFixture);
      await expect(ticket.getTicketDetails(99))
        .to.be.revertedWithCustomError(ticket, "ERC721NonexistentToken");
    });
  });

  describe("resaleTransfer (anti-scalping)", function () {
    it("sells the ticket at face value and forwards payment to the seller", async function () {
      const { ticket, alice, bob } = await loadFixture(mintedFixture);
      const price = await ticket.FACE_VALUE();

      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: price })
      ).to.changeEtherBalances([bob, alice], [-price, price]);

      expect(await ticket.ownerOf(0)).to.equal(bob.address);
    });

    it("emits TicketTransferred(tokenId, from, to, price)", async function () {
      const { ticket, alice, bob } = await loadFixture(mintedFixture);
      const price = ethers.parseEther("0.01");
      await expect(ticket.connect(bob).resaleTransfer(0, { value: price }))
        .to.emit(ticket, "TicketTransferred")
        .withArgs(0, alice.address, bob.address, price);
    });

    it("reverts when the price exceeds the face value (rainy day)", async function () {
      const { ticket, bob } = await loadFixture(mintedFixture);
      const scalperPrice = (await ticket.FACE_VALUE()) + 1n;
      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: scalperPrice })
      ).to.be.revertedWith("Scalping detected: Price exceeds face value");
    });

    it("reverts when the ticket is locked against resale", async function () {
      const { ticket, bob } = await loadFixture(mintedFixture);
      await ticket.setResellable(0, false);
      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: 0 })
      ).to.be.revertedWith("Ticket is not resellable");
    });

    it("reverts when the buyer already owns the ticket", async function () {
      const { ticket, alice } = await loadFixture(mintedFixture);
      await expect(
        ticket.connect(alice).resaleTransfer(0, { value: 0 })
      ).to.be.revertedWith("Cannot buy your own ticket");
    });
  });

  describe("Raw ERC-721 transfer lockdown", function () {
    it("blocks transferFrom so the price ceiling cannot be bypassed", async function () {
      const { ticket, alice, bob } = await loadFixture(mintedFixture);
      await expect(
        ticket.connect(alice).transferFrom(alice.address, bob.address, 0)
      ).to.be.revertedWith("Transfers only allowed through resaleTransfer");
    });

    it("blocks safeTransferFrom as well", async function () {
      const { ticket, alice, bob } = await loadFixture(mintedFixture);
      await expect(
        ticket.connect(alice)["safeTransferFrom(address,address,uint256)"](
          alice.address, bob.address, 0
        )
      ).to.be.revertedWith("Transfers only allowed through resaleTransfer");
    });
  });
});

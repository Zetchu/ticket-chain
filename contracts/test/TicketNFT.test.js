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

  // Token 0 minted to Alice and listed by her at face value — the starting
  // point for every purchase test.
  async function listedFixture() {
    const state = await loadFixture(mintedFixture);
    const price = await state.ticket.FACE_VALUE();
    await state.ticket.connect(state.alice).listForSale(0, price);
    return { ...state, price };
  }

  describe("totalMinted", function () {
    it("returns 0 on a fresh deploy", async function () {
      const { ticket } = await loadFixture(deployFixture);
      expect(await ticket.totalMinted()).to.equal(0);
    });

    it("increments after mintTicket and mintAndList", async function () {
      const { ticket, alice } = await loadFixture(deployFixture);
      await ticket.mintTicket(alice.address);
      expect(await ticket.totalMinted()).to.equal(1);
      await ticket.mintAndList(3);
      expect(await ticket.totalMinted()).to.equal(4);
    });
  });

  describe("mintAndList (primary market)", function () {
    it("mints to the organizer and lists each ticket at face value", async function () {
      const { ticket, organizer } = await loadFixture(deployFixture);
      const price = await ticket.FACE_VALUE();

      await ticket.mintAndList(2);

      expect(await ticket.ownerOf(0)).to.equal(organizer.address);
      expect(await ticket.ownerOf(1)).to.equal(organizer.address);

      const [p0, a0] = await ticket.listings(0);
      expect(p0).to.equal(price);
      expect(a0).to.equal(true);

      const [p1, a1] = await ticket.listings(1);
      expect(p1).to.equal(price);
      expect(a1).to.equal(true);
    });

    it("emits TicketMinted and TicketListed for each token", async function () {
      const { ticket, organizer } = await loadFixture(deployFixture);
      const price = await ticket.FACE_VALUE();

      await expect(ticket.mintAndList(1))
        .to.emit(ticket, "TicketMinted").withArgs(organizer.address, 0, price)
        .and.to.emit(ticket, "TicketListed").withArgs(0, organizer.address, price);
    });

    it("reverts when called by a non-organizer", async function () {
      const { ticket, alice } = await loadFixture(deployFixture);
      await expect(ticket.connect(alice).mintAndList(1))
        .to.be.revertedWithCustomError(ticket, "OwnableUnauthorizedAccount");
    });

    it("reverts with quantity 0", async function () {
      const { ticket } = await loadFixture(deployFixture);
      await expect(ticket.mintAndList(0))
        .to.be.revertedWith("Quantity must be at least 1");
    });

    it("minted tickets are purchasable at face value — ETH goes to the organizer", async function () {
      const { ticket, organizer, bob } = await loadFixture(deployFixture);
      const price = await ticket.FACE_VALUE();
      await ticket.mintAndList(1);

      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: price })
      ).to.changeEtherBalances([bob, organizer], [-price, price]);

      expect(await ticket.ownerOf(0)).to.equal(bob.address);
      expect((await ticket.listings(0)).active).to.equal(false);
    });
  });

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

    it("assigns sequential token IDs across multiple mints", async function () {
      const { ticket, alice, bob } = await loadFixture(deployFixture);
      await ticket.mintTicket(alice.address);
      await ticket.mintTicket(bob.address);
      await ticket.mintTicket(alice.address);
      expect(await ticket.ownerOf(0)).to.equal(alice.address);
      expect(await ticket.ownerOf(1)).to.equal(bob.address);
      expect(await ticket.ownerOf(2)).to.equal(alice.address);
    });

    it("rejects minting to the zero address", async function () {
      const { ticket } = await loadFixture(deployFixture);
      await expect(ticket.mintTicket(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(ticket, "ERC721InvalidReceiver");
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

  describe("setResellable (organizer access control)", function () {
    it("lets the organizer lock and re-unlock a ticket", async function () {
      const { ticket } = await loadFixture(mintedFixture);
      await ticket.setResellable(0, false);
      expect((await ticket.tickets(0)).isResellable).to.equal(false);

      await ticket.setResellable(0, true);
      expect((await ticket.tickets(0)).isResellable).to.equal(true);
    });

    it("rejects setResellable from a non-organizer account", async function () {
      const { ticket, alice } = await loadFixture(mintedFixture);
      await expect(ticket.connect(alice).setResellable(0, false))
        .to.be.revertedWithCustomError(ticket, "OwnableUnauthorizedAccount");
    });

    it("reverts for a nonexistent ticket", async function () {
      const { ticket } = await loadFixture(deployFixture);
      await expect(ticket.setResellable(99, false))
        .to.be.revertedWithCustomError(ticket, "ERC721NonexistentToken");
    });
  });

  describe("listForSale / cancelListing (owner consent)", function () {
    it("lets the ticket owner list at face value", async function () {
      const { ticket, alice } = await loadFixture(mintedFixture);
      const price = await ticket.FACE_VALUE();

      await expect(ticket.connect(alice).listForSale(0, price))
        .to.emit(ticket, "TicketListed")
        .withArgs(0, alice.address, price);

      const [listedPrice, active] = await ticket.listings(0);
      expect(listedPrice).to.equal(price);
      expect(active).to.equal(true);
    });

    it("lets the owner list below face value", async function () {
      const { ticket, alice } = await loadFixture(mintedFixture);
      const discount = ethers.parseEther("0.01");
      await ticket.connect(alice).listForSale(0, discount);
      expect((await ticket.listings(0)).price).to.equal(discount);
    });

    it("rejects a listing above face value (rainy day)", async function () {
      const { ticket, alice } = await loadFixture(mintedFixture);
      const scalperPrice = (await ticket.FACE_VALUE()) + 1n;
      await expect(
        ticket.connect(alice).listForSale(0, scalperPrice)
      ).to.be.revertedWith("Scalping detected: Price exceeds face value");
    });

    it("rejects a listing from someone who does not own the ticket", async function () {
      const { ticket, bob } = await loadFixture(mintedFixture);
      await expect(
        ticket.connect(bob).listForSale(0, await ticket.FACE_VALUE())
      ).to.be.revertedWith("Only the ticket owner can list it");
    });

    it("rejects a listing for a ticket locked against resale", async function () {
      const { ticket, alice } = await loadFixture(mintedFixture);
      await ticket.setResellable(0, false);
      await expect(
        ticket.connect(alice).listForSale(0, await ticket.FACE_VALUE())
      ).to.be.revertedWith("Ticket is not resellable");
    });

    it("lets the owner re-list at a new price", async function () {
      const { ticket, alice } = await loadFixture(listedFixture);
      const lower = ethers.parseEther("0.02");
      await ticket.connect(alice).listForSale(0, lower);
      expect((await ticket.listings(0)).price).to.equal(lower);
    });

    it("lets the owner cancel a listing", async function () {
      const { ticket, alice } = await loadFixture(listedFixture);

      await expect(ticket.connect(alice).cancelListing(0))
        .to.emit(ticket, "TicketUnlisted")
        .withArgs(0, alice.address);

      expect((await ticket.listings(0)).active).to.equal(false);
    });

    it("rejects cancelling a listing the caller does not own", async function () {
      const { ticket, bob } = await loadFixture(listedFixture);
      await expect(
        ticket.connect(bob).cancelListing(0)
      ).to.be.revertedWith("Only the ticket owner can cancel it");
    });

    it("rejects cancelling a ticket that is not listed", async function () {
      const { ticket, alice } = await loadFixture(mintedFixture);
      await expect(
        ticket.connect(alice).cancelListing(0)
      ).to.be.revertedWith("Ticket is not listed for sale");
    });

    it("withdraws the listing when the organizer locks the ticket", async function () {
      const { ticket, alice } = await loadFixture(listedFixture);

      await expect(ticket.setResellable(0, false))
        .to.emit(ticket, "TicketUnlisted")
        .withArgs(0, alice.address);

      expect((await ticket.listings(0)).active).to.equal(false);
    });
  });

  describe("resaleTransfer (anti-scalping)", function () {
    it("sells the ticket at the listed price and forwards payment to the seller", async function () {
      const { ticket, alice, bob, price } = await loadFixture(listedFixture);

      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: price })
      ).to.changeEtherBalances([bob, alice], [-price, price]);

      expect(await ticket.ownerOf(0)).to.equal(bob.address);
    });

    it("clears the listing once the sale completes", async function () {
      const { ticket, bob, price } = await loadFixture(listedFixture);
      await ticket.connect(bob).resaleTransfer(0, { value: price });
      expect((await ticket.listings(0)).active).to.equal(false);
    });

    it("emits TicketTransferred(tokenId, from, to, price)", async function () {
      const { ticket, alice, bob, price } = await loadFixture(listedFixture);
      await expect(ticket.connect(bob).resaleTransfer(0, { value: price }))
        .to.emit(ticket, "TicketTransferred")
        .withArgs(0, alice.address, bob.address, price);
    });

    it("reverts when the ticket was never listed — the holder is not forced to sell", async function () {
      const { ticket, bob } = await loadFixture(mintedFixture);
      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: await ticket.FACE_VALUE() })
      ).to.be.revertedWith("Ticket is not listed for sale");
    });

    it("reverts when the listing was cancelled before the purchase landed", async function () {
      const { ticket, alice, bob, price } = await loadFixture(listedFixture);
      await ticket.connect(alice).cancelListing(0);
      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: price })
      ).to.be.revertedWith("Ticket is not listed for sale");
    });

    it("reverts when the buyer overpays the listed price", async function () {
      const { ticket, bob, price } = await loadFixture(listedFixture);
      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: price + 1n })
      ).to.be.revertedWith("Payment must equal the listed price");
    });

    it("reverts when the buyer underpays the listed price", async function () {
      const { ticket, bob, price } = await loadFixture(listedFixture);
      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: price - 1n })
      ).to.be.revertedWith("Payment must equal the listed price");
    });

    it("reverts when the buyer sends nothing at all", async function () {
      const { ticket, bob } = await loadFixture(listedFixture);
      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: 0 })
      ).to.be.revertedWith("Payment must equal the listed price");
    });

    it("reverts when the ticket is locked against resale", async function () {
      const { ticket, bob, price } = await loadFixture(listedFixture);
      // Locking also withdraws the listing, so the sale is refused at the
      // listing check rather than the resellable one.
      await ticket.setResellable(0, false);
      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: price })
      ).to.be.revertedWith("Ticket is not listed for sale");
    });

    it("reverts when the buyer already owns the ticket", async function () {
      const { ticket, alice, price } = await loadFixture(listedFixture);
      await expect(
        ticket.connect(alice).resaleTransfer(0, { value: price })
      ).to.be.revertedWith("Cannot buy your own ticket");
    });

    it("reverts for a nonexistent ticket", async function () {
      const { ticket, bob } = await loadFixture(deployFixture);
      await expect(
        ticket.connect(bob).resaleTransfer(99, { value: 0 })
      ).to.be.revertedWithCustomError(ticket, "ERC721NonexistentToken");
    });

    it("supports being resold multiple times in a row, always at face value", async function () {
      const { ticket, organizer, alice, bob } = await loadFixture(listedFixture);
      const price = await ticket.FACE_VALUE();

      // alice -> bob
      await ticket.connect(bob).resaleTransfer(0, { value: price });
      expect(await ticket.ownerOf(0)).to.equal(bob.address);

      // bob -> organizer (each new owner must offer the ticket in turn)
      await ticket.connect(bob).listForSale(0, price);
      await ticket.connect(organizer).resaleTransfer(0, { value: price });
      expect(await ticket.ownerOf(0)).to.equal(organizer.address);

      // organizer -> alice
      await ticket.connect(organizer).listForSale(0, price);
      await expect(
        ticket.connect(alice).resaleTransfer(0, { value: price })
      ).to.changeEtherBalances([alice, organizer], [-price, price]);
      expect(await ticket.ownerOf(0)).to.equal(alice.address);

      // the face-value ceiling still holds for the fourth owner
      expect(await ticket.getTicketDetails(0)).to.equal(price);
    });

    it("reverts and leaves ownership unchanged when payment to the seller fails", async function () {
      const { ticket, organizer, bob } = await loadFixture(deployFixture);
      const RejectsEther = await ethers.getContractFactory("RejectsEther");
      const rejector = await RejectsEther.deploy();
      const rejectorAddress = await rejector.getAddress();

      await ticket.mintTicket(rejectorAddress);
      const price = await ticket.FACE_VALUE();
      await rejector.listHeldTicket(await ticket.getAddress(), 0, price);

      await expect(
        ticket.connect(bob).resaleTransfer(0, { value: price })
      ).to.be.revertedWith("Payment to seller failed");

      // the whole transaction (including the token transfer) rolled back
      expect(await ticket.ownerOf(0)).to.equal(rejectorAddress);
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

  describe("Unauthorized transfers", function () {
    it("blocks a stranger with no approval from moving someone else's ticket", async function () {
      const { ticket, alice, bob } = await loadFixture(mintedFixture);
      // bob has neither ownership nor approval over token 0 — the anti-scalping
      // lockdown in _update fires before ERC-721's own auth check even runs,
      // so this reverts with the resale-lockdown reason, not an approval error.
      await expect(
        ticket.connect(bob).transferFrom(alice.address, bob.address, 0)
      ).to.be.revertedWith("Transfers only allowed through resaleTransfer");
    });

    it("blocks a per-token approved address from bypassing the price ceiling", async function () {
      const { ticket, alice, bob } = await loadFixture(mintedFixture);
      await ticket.connect(alice).approve(bob.address, 0);
      expect(await ticket.getApproved(0)).to.equal(bob.address);

      await expect(
        ticket.connect(bob).transferFrom(alice.address, bob.address, 0)
      ).to.be.revertedWith("Transfers only allowed through resaleTransfer");
    });

    it("blocks an operator approved for all tokens from bypassing the price ceiling", async function () {
      const { ticket, alice, bob } = await loadFixture(mintedFixture);
      await ticket.connect(alice).setApprovalForAll(bob.address, true);

      await expect(
        ticket.connect(bob).transferFrom(alice.address, bob.address, 0)
      ).to.be.revertedWith("Transfers only allowed through resaleTransfer");
      // ticket never moved despite the blanket approval
      expect(await ticket.ownerOf(0)).to.equal(alice.address);
    });
  });
});

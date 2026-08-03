// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TicketNFT
/// @notice Event tickets represented as ERC-721 tokens for the TicketChain
///         localized P2P ticketing network. Each ticket carries a face value
///         enforced as a hard price ceiling on every resale (anti-scalping).
contract TicketNFT is ERC721, Ownable {
    /// @notice Per-ticket metadata: the face value set at minting (the resale
    ///         price ceiling) and whether the ticket may be resold at all.
    struct Ticket {
        uint256 faceValue;
        bool isResellable;
    }

    /// @notice An owner's standing offer to sell a ticket at `price`.
    /// @dev A ticket can only be bought while its listing is active: ownership
    ///      never changes without the holder having offered the ticket first.
    struct Listing {
        uint256 price;
        bool active;
    }

    /// @notice Hard-coded face value every ticket is issued at.
    uint256 public constant FACE_VALUE = 0.05 ether;

    uint256 private _nextTokenId;

    /// @notice Ticket metadata per token ID.
    mapping(uint256 tokenId => Ticket) public tickets;

    /// @notice Active resale offers per token ID.
    mapping(uint256 tokenId => Listing) public listings;

    /// @dev Set while a resaleTransfer is in flight so _update can distinguish
    ///      contract-mediated sales from raw ERC-721 transfers (which are
    ///      blocked — an off-chain scalper deal would bypass the price check).
    bool private _inResale;

    event TicketMinted(address indexed to, uint256 indexed tokenId, uint256 faceValue);
    event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event TicketUnlisted(uint256 indexed tokenId, address indexed seller);
    event TicketTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 price
    );

    constructor() ERC721("TicketChain Event Ticket", "TCKT") Ownable(msg.sender) {}

    /// @notice Issue a new resellable ticket to `to` at the hard-coded face value.
    function mintTicket(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        tickets[tokenId] = Ticket({faceValue: FACE_VALUE, isResellable: true});
        _safeMint(to, tokenId);
        emit TicketMinted(to, tokenId, FACE_VALUE);
    }

    /// @notice Offer the caller's ticket for resale at `price`.
    /// @dev The price ceiling is enforced here rather than at purchase time:
    ///      a scalper cannot even advertise above face value. Re-listing an
    ///      already-listed ticket simply updates the price.
    function listForSale(uint256 tokenId, uint256 price) external {
        require(ownerOf(tokenId) == msg.sender, "Only the ticket owner can list it");
        require(tickets[tokenId].isResellable, "Ticket is not resellable");
        require(
            price <= tickets[tokenId].faceValue,
            "Scalping detected: Price exceeds face value"
        );

        listings[tokenId] = Listing({price: price, active: true});
        emit TicketListed(tokenId, msg.sender, price);
    }

    /// @notice Withdraw a ticket from sale.
    function cancelListing(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Only the ticket owner can cancel it");
        require(listings[tokenId].active, "Ticket is not listed for sale");

        delete listings[tokenId];
        emit TicketUnlisted(tokenId, msg.sender);
    }

    /// @notice Buy `tokenId` from its current owner at the listed price.
    /// @dev The buyer initiates the sale; payment is forwarded to the seller
    ///      and the ticket is transferred atomically. The ticket must be
    ///      listed — a holder is never forced to sell — and `msg.value` must
    ///      match the listed price exactly, which is itself capped at face
    ///      value when the listing is created.
    function resaleTransfer(uint256 tokenId) external payable {
        Listing memory listing = listings[tokenId];
        address seller = ownerOf(tokenId);

        require(listing.active, "Ticket is not listed for sale");
        require(tickets[tokenId].isResellable, "Ticket is not resellable");
        require(msg.sender != seller, "Cannot buy your own ticket");
        require(msg.value == listing.price, "Payment must equal the listed price");

        // Clear the listing before transferring: the sale is done, and the new
        // owner must make their own offer before the ticket can move again.
        delete listings[tokenId];

        _inResale = true;
        _safeTransfer(seller, msg.sender, tokenId, "");

        (bool paid, ) = payable(seller).call{value: msg.value}("");
        require(paid, "Payment to seller failed");

        emit TicketTransferred(tokenId, seller, msg.sender, msg.value);
    }

    /// @notice Read the current (face-value-capped) price of a ticket.
    function getTicketDetails(uint256 ticketId) external view returns (uint256 price) {
        _requireOwned(ticketId);
        return tickets[ticketId].faceValue;
    }

    /// @notice Allow the organizer to lock a ticket against resale.
    /// @dev Locking also withdraws any standing offer, so the UI can never show
    ///      a listed ticket that would revert on purchase.
    function setResellable(uint256 tokenId, bool resellable) external onlyOwner {
        address holder = _requireOwned(tokenId);
        tickets[tokenId].isResellable = resellable;

        if (!resellable && listings[tokenId].active) {
            delete listings[tokenId];
            emit TicketUnlisted(tokenId, holder);
        }
    }

    /// @dev Block raw ERC-721 transfers (transferFrom/safeTransferFrom): every
    ///      ownership change must go through resaleTransfer so the price
    ///      ceiling is always enforced. Minting (from == 0) stays allowed.
    ///      The flag is consumed here rather than cleared by resaleTransfer:
    ///      it authorizes exactly one transfer, so a buyer contract cannot
    ///      re-enter from its onERC721Received hook (which fires after this
    ///      returns) and move the ticket on while the guard is still open.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0)) {
            require(_inResale, "Transfers only allowed through resaleTransfer");
            _inResale = false;
        }
        return super._update(to, tokenId, auth);
    }
}

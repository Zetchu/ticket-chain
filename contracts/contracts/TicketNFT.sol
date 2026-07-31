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

    /// @notice Hard-coded face value every ticket is issued at.
    uint256 public constant FACE_VALUE = 0.05 ether;

    uint256 private _nextTokenId;

    /// @notice Ticket metadata per token ID.
    mapping(uint256 tokenId => Ticket) public tickets;

    /// @dev Set while a resaleTransfer is in flight so _update can distinguish
    ///      contract-mediated sales from raw ERC-721 transfers (which are
    ///      blocked — an off-chain scalper deal would bypass the price check).
    bool private _inResale;

    event TicketMinted(address indexed to, uint256 indexed tokenId, uint256 faceValue);
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

    /// @notice Buy `tokenId` from its current owner at `msg.value`.
    /// @dev The buyer initiates the sale; payment is forwarded to the seller
    ///      and the ticket is transferred atomically. The sale price can never
    ///      exceed the face value set at minting.
    function resaleTransfer(uint256 tokenId) external payable {
        Ticket storage ticket = tickets[tokenId];
        address seller = ownerOf(tokenId);

        require(ticket.isResellable, "Ticket is not resellable");
        require(msg.sender != seller, "Cannot buy your own ticket");
        require(msg.value <= ticket.faceValue, "Scalping detected: Price exceeds face value");

        _inResale = true;
        _safeTransfer(seller, msg.sender, tokenId, "");
        _inResale = false;

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
    function setResellable(uint256 tokenId, bool resellable) external onlyOwner {
        _requireOwned(tokenId);
        tickets[tokenId].isResellable = resellable;
    }

    /// @dev Block raw ERC-721 transfers (transferFrom/safeTransferFrom): every
    ///      ownership change must go through resaleTransfer so the price
    ///      ceiling is always enforced. Minting (from == 0) stays allowed.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        require(
            from == address(0) || _inResale,
            "Transfers only allowed through resaleTransfer"
        );
        return super._update(to, tokenId, auth);
    }
}

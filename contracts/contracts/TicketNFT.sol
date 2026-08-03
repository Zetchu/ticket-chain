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
        /// @dev Which event this ticket admits to — an index into `eventDetails`.
        uint256 eventId;
    }

    /// @notice What a ticket is actually for: the event's name and start time.
    /// @dev Held once per event rather than per ticket — a 500-seat show would
    ///      otherwise store the same string 500 times.
    struct EventDetails {
        string name;
        /// @dev Unix timestamp (seconds) of the event start; 0 when unset.
        uint256 date;
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
    uint256 private _nextEventId;

    /// @notice Ticket metadata per token ID.
    mapping(uint256 tokenId => Ticket) public tickets;

    /// @notice Event name and date per event ID.
    mapping(uint256 eventId => EventDetails) public eventDetails;

    /// @notice Active resale offers per token ID.
    mapping(uint256 tokenId => Listing) public listings;

    /// @dev Set while a resaleTransfer is in flight so _update can distinguish
    ///      contract-mediated sales from raw ERC-721 transfers (which are
    ///      blocked — an off-chain scalper deal would bypass the price check).
    bool private _inResale;

    event EventCreated(uint256 indexed eventId, string name, uint256 date);
    event TicketMinted(address indexed to, uint256 indexed tokenId, uint256 faceValue);
    event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event TicketUnlisted(uint256 indexed tokenId, address indexed seller);
    event TicketTransferred(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 price
    );

    constructor() ERC721("TicketChain Event Ticket", "TCKT") Ownable(msg.sender) {
        // Event 0 is the fallback for tickets issued with mintTicket(), which
        // carries no event of its own.
        _nextEventId = 1;
        eventDetails[0] = EventDetails({name: "General Admission", date: 0});
        emit EventCreated(0, "General Admission", 0);
    }

    /// @notice Issue a new resellable ticket to `to` at the hard-coded face value.
    /// @dev Assigned to event 0 ("General Admission"); use mintAndList to issue
    ///      tickets for a named event.
    function mintTicket(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = _mintOne(to, 0);
    }

    /// @notice Mint `quantity` tickets for a named event, to the organizer, and
    ///         list each at face value so they are immediately purchasable.
    /// @param quantity  How many tickets to issue.
    /// @param name      Event name shown on every ticket in the batch.
    /// @param date      Event start as a Unix timestamp (seconds).
    /// @dev The primary sale flows through resaleTransfer — one payment code
    ///      path, price ceiling enforced on first sale just like any resale.
    ///      Each call creates one event, so two batches are two events even if
    ///      the details match.
    function mintAndList(uint256 quantity, string calldata name, uint256 date)
        external
        onlyOwner
        returns (uint256 eventId)
    {
        require(quantity > 0, "Quantity must be at least 1");
        require(bytes(name).length > 0, "Event name is required");
        require(date > 0, "Event date is required");

        eventId = _nextEventId++;
        eventDetails[eventId] = EventDetails({name: name, date: date});
        emit EventCreated(eventId, name, date);

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = _mintOne(msg.sender, eventId);
            listings[tokenId] = Listing({price: FACE_VALUE, active: true});
            emit TicketListed(tokenId, msg.sender, FACE_VALUE);
        }
    }

    /// @notice Name and date of the event a ticket admits to.
    /// @dev One call per ticket for the frontend, instead of reading the token's
    ///      event ID and then looking the event up separately.
    function getTicketEvent(uint256 tokenId)
        external
        view
        returns (string memory name, uint256 date)
    {
        _requireOwned(tokenId);
        EventDetails storage details = eventDetails[tickets[tokenId].eventId];
        return (details.name, details.date);
    }

    /// @dev Issue one ticket for `eventId` at face value. Shared by both mint
    ///      entry points so the ticket record is built in exactly one place.
    function _mintOne(address to, uint256 eventId) private returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        tickets[tokenId] = Ticket({
            faceValue: FACE_VALUE,
            isResellable: true,
            eventId: eventId
        });
        _safeMint(to, tokenId);
        emit TicketMinted(to, tokenId, FACE_VALUE);
    }

    /// @notice Total number of tickets minted so far (equals the next token ID).
    /// @dev The frontend enumerates 0..totalMinted-1 to discover all tokens
    ///      without depending solely on the P2P feed.
    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
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

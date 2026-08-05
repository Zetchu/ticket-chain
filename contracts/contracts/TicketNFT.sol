// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

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
        /// @dev Content hash of the organizer's uploaded artwork, resolved
        ///      against `imageBaseURI`. Empty when no image was uploaded, in
        ///      which case tokenURI falls back to art generated on-chain.
        string imageRef;
        /// @dev Per-event cap on primary-sale purchases by any one address.
        ///      0 means unlimited. Enforced in resaleTransfer when the seller
        ///      is the organizer (owner()). Set at mint time; permanent for
        ///      the batch, matching the invariant used for faceValue.
        uint256 maxPerBuyer;
    }

    /// @notice An owner's standing offer to sell a ticket at `price`.
    /// @dev A ticket can only be bought while its listing is active: ownership
    ///      never changes without the holder having offered the ticket first.
    struct Listing {
        uint256 price;
        bool active;
    }

    /// @notice Face value used by mintTicket(), which takes no price of its
    ///         own. mintAndList() batches carry the organizer's chosen value.
    uint256 public constant DEFAULT_FACE_VALUE = 0.05 ether;

    /// @notice Where uploaded artwork is served from — an event's `imageRef` is
    ///         appended to this to form the image URL in the token metadata.
    /// @dev Defaults to the local P2P node's image endpoint. Kept configurable
    ///      because the host is deployment-specific, while the content hash
    ///      stored per event is not.
    string public imageBaseURI = "http://127.0.0.1:8080/images/";

    uint256 private _nextTokenId;
    uint256 private _nextEventId;

    /// @notice Ticket metadata per token ID.
    mapping(uint256 tokenId => Ticket) public tickets;

    /// @notice Event name and date per event ID.
    mapping(uint256 eventId => EventDetails) public eventDetails;

    /// @notice Active resale offers per token ID.
    mapping(uint256 tokenId => Listing) public listings;

    /// @notice How many primary-sale tickets each wallet has bought per event.
    /// @dev Only incremented in resaleTransfer when the seller is the organizer
    ///      (owner()) — see the primary-sale definition on maxPerBuyer.
    mapping(uint256 eventId => mapping(address buyer => uint256 bought)) public primaryBought;

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
        eventDetails[0] = EventDetails({name: "General Admission", date: 0, imageRef: "", maxPerBuyer: 0});
        emit EventCreated(0, "General Admission", 0);
    }

    /// @notice Point token metadata at a different artwork host.
    function setImageBaseURI(string calldata baseURI) external onlyOwner {
        imageBaseURI = baseURI;
    }

    /// @notice Issue a new resellable ticket to `to` at the default face value.
    /// @dev Assigned to event 0 ("General Admission"); use mintAndList to issue
    ///      tickets for a named event at a price of the organizer's choosing.
    function mintTicket(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = _mintOne(to, 0, DEFAULT_FACE_VALUE);
    }

    /// @notice Mint `quantity` tickets for a named event, to the organizer, and
    ///         list each at `faceValue` so they are immediately purchasable.
    /// @param quantity   How many tickets to issue.
    /// @param name       Event name shown on every ticket in the batch.
    /// @param date       Event start as a Unix timestamp (seconds).
    /// @param imageRef   Content hash of the organizer's uploaded artwork, or an
    ///                   empty string to use the artwork generated on-chain.
    /// @param faceValue  Price (wei) each ticket in the batch is issued and
    ///                   listed at. Permanent: it is the anti-scalping ceiling
    ///                   for every future resale of these tickets and cannot be
    ///                   changed afterwards. A new batch (a new event) may use
    ///                   any other value.
    /// @dev The primary sale flows through resaleTransfer — one payment code
    ///      path, price ceiling enforced on first sale just like any resale.
    ///      Each call creates one event, so two batches are two events even if
    ///      the details match.
    function mintAndList(
        uint256 quantity,
        string calldata name,
        uint256 date,
        string calldata imageRef,
        uint256 faceValue,
        uint256 maxPerBuyer
    ) external onlyOwner returns (uint256 eventId) {
        require(quantity > 0, "Quantity must be at least 1");
        require(bytes(name).length > 0, "Event name is required");
        require(date > 0, "Event date is required");
        require(faceValue > 0, "Face value is required");

        eventId = _nextEventId++;
        eventDetails[eventId] = EventDetails({
            name: name,
            date: date,
            imageRef: imageRef,
            maxPerBuyer: maxPerBuyer
        });
        emit EventCreated(eventId, name, date);

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = _mintOne(msg.sender, eventId, faceValue);
            listings[tokenId] = Listing({price: faceValue, active: true});
            emit TicketListed(tokenId, msg.sender, faceValue);
        }
    }

    /// @notice Name, date, artwork URL and face value of the ticket's event.
    /// @dev One call per ticket for the frontend, instead of reading the token's
    ///      event ID and then looking the event up separately. `image` is the
    ///      resolved URL of the organizer's upload, or empty when the ticket
    ///      uses the artwork generated on-chain by tokenURI. `faceValue` is
    ///      this ticket's own resale ceiling — per token, since every batch
    ///      may be priced differently.
    function getTicketEvent(uint256 tokenId)
        external
        view
        returns (
            string memory name,
            uint256 date,
            string memory image,
            uint256 faceValue,
            uint256 maxPerBuyer
        )
    {
        _requireOwned(tokenId);
        Ticket storage ticket = tickets[tokenId];
        EventDetails storage details = eventDetails[ticket.eventId];
        return (details.name, details.date, _imageURL(details), ticket.faceValue, details.maxPerBuyer);
    }

    /// @notice ERC-721 metadata for `tokenId`, as a self-contained data URI.
    /// @dev Built and base64-encoded on-chain so a wallet needs nothing but the
    ///      contract to render a ticket. When the organizer uploaded artwork the
    ///      metadata points at it; otherwise `image` carries an SVG generated
    ///      here, so a ticket is never a blank square.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        Ticket storage ticket = tickets[tokenId];
        EventDetails storage details = eventDetails[ticket.eventId];

        string memory image = _imageURL(details);
        if (bytes(image).length == 0) {
            image = _generatedArtwork(tokenId, details.name);
        }

        string memory json = string.concat(
            '{"name":"',
            _escapeJson(details.name),
            " #",
            Strings.toString(tokenId),
            '","description":"A TicketChain event pass. Resale is capped at the ',
            'original face value, enforced by the contract itself.",',
            '"image":"',
            image,
            '","attributes":[',
            '{"trait_type":"Event","value":"',
            _escapeJson(details.name),
            '"},',
            '{"display_type":"date","trait_type":"Event date","value":',
            Strings.toString(details.date),
            "},",
            '{"trait_type":"Face value","value":"',
            _formatEther(ticket.faceValue),
            '"},',
            '{"trait_type":"Token ID","value":',
            Strings.toString(tokenId),
            "}]}"
        );

        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        );
    }

    /// @dev Resolved URL of an event's uploaded artwork, or "" when it has none.
    function _imageURL(EventDetails storage details) private view returns (string memory) {
        if (bytes(details.imageRef).length == 0) return "";
        return string.concat(imageBaseURI, details.imageRef);
    }

    /// @dev Artwork for tickets with no uploaded image: an SVG built from the
    ///      token ID, so every ticket looks like itself and needs no host.
    function _generatedArtwork(uint256 tokenId, string memory name)
        private
        pure
        returns (string memory)
    {
        // Two hues derived from the token ID — deterministic, and far enough
        // apart that neighbouring tickets are visibly different.
        uint256 hue = (tokenId * 47) % 360;
        string memory from = string.concat("hsl(", Strings.toString(hue), ",85%,55%)");
        string memory to = string.concat("hsl(", Strings.toString((hue + 60) % 360), ",75%,25%)");

        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">',
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
            '<stop offset="0%" stop-color="',
            from,
            '"/><stop offset="100%" stop-color="',
            to,
            '"/></linearGradient></defs>',
            '<rect width="600" height="600" fill="url(#g)"/>',
            '<rect x="30" y="30" width="540" height="540" fill="none" ',
            'stroke="rgba(255,255,255,0.45)" stroke-width="2" rx="16"/>',
            '<text x="60" y="440" font-family="monospace" font-size="26" ',
            'fill="rgba(255,255,255,0.75)">TICKETCHAIN</text>',
            '<text x="60" y="500" font-family="sans-serif" font-size="42" ',
            'font-weight="700" fill="#ffffff">',
            _escapeXml(name),
            "</text>",
            '<text x="60" y="545" font-family="monospace" font-size="28" ',
            'fill="rgba(255,255,255,0.8)">#',
            Strings.toString(tokenId),
            "</text></svg>"
        );

        return string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));
    }

    /// @dev Escape the characters that would break out of an XML text node.
    function _escapeXml(string memory input) private pure returns (string memory out) {
        bytes memory raw = bytes(input);
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 c = raw[i];
            if (c == "&") out = string.concat(out, "&amp;");
            else if (c == "<") out = string.concat(out, "&lt;");
            else if (c == ">") out = string.concat(out, "&gt;");
            else if (c == '"') out = string.concat(out, "&quot;");
            else if (c == "'") out = string.concat(out, "&apos;");
            else out = string.concat(out, string(abi.encodePacked(c)));
        }
    }

    /// @dev Escape the characters that would break out of a JSON string.
    function _escapeJson(string memory input) private pure returns (string memory out) {
        bytes memory raw = bytes(input);
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 c = raw[i];
            if (c == '"') out = string.concat(out, '\\"');
            else if (c == "\\") out = string.concat(out, "\\\\");
            // Control characters are illegal raw in JSON; drop them rather than
            // emit a document a wallet cannot parse.
            else if (uint8(c) >= 0x20) out = string.concat(out, string(abi.encodePacked(c)));
        }
    }

    /// @dev Issue one ticket for `eventId` at `faceValue`. Shared by both mint
    ///      entry points so the ticket record is built in exactly one place.
    function _mintOne(address to, uint256 eventId, uint256 faceValue)
        private
        returns (uint256 tokenId)
    {
        tokenId = _nextTokenId++;
        tickets[tokenId] = Ticket({
            faceValue: faceValue,
            isResellable: true,
            eventId: eventId
        });
        _safeMint(to, tokenId);
        emit TicketMinted(to, tokenId, faceValue);
    }

    /// @dev Render a wei amount as an "N.NNN ETH" string for token metadata,
    ///      trimming trailing zeros from the fractional part.
    function _formatEther(uint256 weiAmount) private pure returns (string memory) {
        uint256 whole = weiAmount / 1 ether;
        uint256 fraction = weiAmount % 1 ether;
        if (fraction == 0) return string.concat(Strings.toString(whole), " ETH");

        // Left-pad the fraction to 18 digits, then drop trailing zeros.
        bytes memory digits = bytes(Strings.toString(fraction));
        bytes memory padded = new bytes(18);
        uint256 pad = 18 - digits.length;
        for (uint256 i = 0; i < 18; i++) {
            padded[i] = i < pad ? bytes1("0") : digits[i - pad];
        }
        uint256 end = 18;
        while (padded[end - 1] == "0") end--;
        bytes memory trimmed = new bytes(end);
        for (uint256 i = 0; i < end; i++) trimmed[i] = padded[i];

        return string.concat(Strings.toString(whole), ".", string(trimmed), " ETH");
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

        // Primary sale = seller is the organizer. Secondary sales stay
        // uncapped: the face-value ceiling already prevents scalping there,
        // and capping them would block legitimate resale. The "seller ==
        // owner()" choice is documented in the spec; the trade-off is that
        // if the organizer buys back and re-sells, that re-sale counts as
        // primary again.
        if (seller == owner()) {
            uint256 eventId = tickets[tokenId].eventId;
            uint256 cap = eventDetails[eventId].maxPerBuyer;
            if (cap != 0) {
                require(
                    primaryBought[eventId][msg.sender] < cap,
                    "Primary purchase limit reached for this event"
                );
            }
            primaryBought[eventId][msg.sender] += 1;
        }

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

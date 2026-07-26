// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TicketNFT
/// @notice Event tickets represented as ERC-721 tokens for the TicketChain
///         localized P2P ticketing network. Each ticket carries a face value
///         that the anti-scalping transfer logic will enforce as a price
///         ceiling on secondary transfers.
contract TicketNFT is ERC721, Ownable {
    /// @notice Hard-coded face value every ticket is issued at (Week 1).
    ///         Will become configurable per-event in a later sprint.
    uint256 public constant FACE_VALUE = 0.05 ether;

    uint256 private _nextTokenId;

    /// @notice Face value each ticket was issued at, used as the resale ceiling.
    mapping(uint256 tokenId => uint256) public faceValueOf;

    event TicketMinted(address indexed to, uint256 indexed tokenId, uint256 faceValue);
    event TicketTransferred(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId,
        uint256 salePrice
    );

    constructor() ERC721("TicketChain Event Ticket", "TCKT") Ownable(msg.sender) {}

    /// @notice Issue a new ticket to `to` at the hard-coded face value.
    function mintTicket(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        faceValueOf[tokenId] = FACE_VALUE;
        _safeMint(to, tokenId);
        emit TicketMinted(to, tokenId, FACE_VALUE);
    }

    /// @notice Custom transfer entry point for peer-to-peer ticket sales.
    /// @dev Week 1 stub: only the price-ceiling guard is in place. The full
    ///      anti-scalping flow is scheduled for the next sprint:
    ///      TODO(Week 2): escrow the buyer's payment and release on transfer
    ///      TODO(Week 2): settle payment to the seller (currently no funds move)
    ///      TODO(Week 2): broadcast the state change to the PyIPv8 overlay
    function transferTicket(address to, uint256 tokenId, uint256 salePrice) external {
        require(salePrice <= faceValueOf[tokenId], "TicketNFT: price exceeds face value");
        safeTransferFrom(msg.sender, to, tokenId);
        emit TicketTransferred(msg.sender, to, tokenId, salePrice);
    }
}

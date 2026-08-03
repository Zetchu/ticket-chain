// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface ITicketNFTListing {
    function listForSale(uint256 tokenId, uint256 price) external;
}

/// @title RejectsEther
/// @notice Test-only mock. Implements onERC721Received so it can hold a
///         TicketNFT, but declares no receive/fallback, so any plain ETH
///         transfer to it reverts. Used to exercise TicketNFT.resaleTransfer's
///         "Payment to seller failed" branch, which no EOA-only test can reach.
contract RejectsEther is IERC721Receiver {
    /// @notice List a held ticket, so the failing-payment branch is reachable:
    ///         a sale only happens once the holder has offered the ticket.
    function listHeldTicket(address ticketNFT, uint256 tokenId, uint256 price) external {
        ITicketNFTListing(ticketNFT).listForSale(tokenId, price);
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }
}

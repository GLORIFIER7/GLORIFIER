// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title GLORIFIER SERVICES Official Logo #001
/// @notice Review-only single-edition ERC-721. Deployment and minting require separate human authorization.
/// @dev The approved metadata URI is compiled into the contract. No public mint, URI mutation, upgrade, or withdrawal path exists.
contract GLORIFIERServicesLogo721 is ERC721, Ownable {
    uint256 public constant TOKEN_ID = 1;
    string private constant _METADATA_URI =
        "ipfs://QmZ1Na7Bdn23fKJdWK5JSvLTThTZ8j1r8W5SujHbVhX3wX";

    bool public minted;

    error InvalidRecipient();
    error AlreadyMinted();

    constructor(address initialOwner)
        ERC721(unicode"GLORIFIER SERVICES — Official Logo #001", "GLORIFIER-LOGO-001")
        Ownable(initialOwner)
    {}

    /// @notice Mint the single edition. This function does not run during deployment.
    /// @dev Only the owner can mint; the token can be minted at most once.
    function mint(address recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidRecipient();
        if (minted) revert AlreadyMinted();
        minted = true;
        _safeMint(recipient, TOKEN_ID);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _METADATA_URI;
    }
}

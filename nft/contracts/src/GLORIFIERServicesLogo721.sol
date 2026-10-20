// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title GLORIFIER SERVICES Official Logo #001
/// @notice Review-only single-edition ERC-721. Deployment and minting require separate human authorization.
/// @dev The metadata URI is set once at construction. No public mint, URI mutation, upgrade, or withdrawal path exists.
contract GLORIFIERServicesLogo721 is ERC721, Ownable {
    uint256 public constant TOKEN_ID = 1;
    string private _metadataURI;

    bool public minted;

    error InvalidRecipient();
    error InvalidMetadataURI();
    error AlreadyMinted();

    constructor(address initialOwner, string memory metadataURI)
        ERC721(unicode"GLORIFIER SERVICES — Official Logo #001", "GLORIFIER-LOGO-001")
        Ownable(initialOwner)
    {
        if (bytes(metadataURI).length == 0) revert InvalidMetadataURI();
        _metadataURI = metadataURI;
    }

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
        return _metadataURI;
    }
}

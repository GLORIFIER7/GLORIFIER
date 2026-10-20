// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title GLORIFIER SERVICES — Official Logo #001 (legacy duplicate)
/// @notice Legacy review-only implementation. Do not deploy; use GLORIFIERServicesLogo721.sol instead.
/// @dev Retained temporarily for compatibility while references are audited.
contract GlorifierServicesLogo001 is ERC721, Ownable {
    string private _fixedMetadataURI;
    bool public minted;

    error AlreadyMinted();
    error InvalidRecipient();
    error EmptyMetadataURI();

    constructor(address initialOwner, string memory metadataURI)
        ERC721(unicode"GLORIFIER SERVICES — Official Logo #001", "GLRLOGO001")
        Ownable(initialOwner)
    {
        if (initialOwner == address(0)) revert InvalidRecipient();
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        _fixedMetadataURI = metadataURI;
    }

    /// @notice Mints token ID 1 exactly once. There is no additional mint path.
    function mintOnce(address recipient) external onlyOwner {
        if (minted) revert AlreadyMinted();
        if (recipient == address(0)) revert InvalidRecipient();

        // Set before _safeMint so a receiver callback cannot re-enter a mint path.
        minted = true;
        _safeMint(recipient, 1);
    }

    /// @notice Returns the constructor-set metadata URI for the sole token.
    /// @dev No setter exists; the URI cannot be changed through the contract API.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _fixedMetadataURI;
    }
}

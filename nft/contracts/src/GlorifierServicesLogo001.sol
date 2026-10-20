// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title GLORIFIER SERVICES — Official Logo #001
/// @notice Review-only contract for a fixed edition of one. Not deployed.
contract GlorifierServicesLogo001 is ERC721, Ownable {
    string private immutable _fixedMetadataURI;
    bool public minted;

    error AlreadyMinted();
    error InvalidRecipient();
    error EmptyMetadataURI();

    constructor(address initialOwner, string memory metadataURI)
        ERC721("GLORIFIER SERVICES — Official Logo #001", "GLRLOGO001")
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

    /// @notice Returns the immutable metadata URI for the sole token.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _fixedMetadataURI;
    }
}

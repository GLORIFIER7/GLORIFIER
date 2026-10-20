// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GLORIFIERServicesLogo721} from "../src/GLORIFIERServicesLogo721.sol";

contract GLORIFIERServicesLogo721Test is Test {
    GLORIFIERServicesLogo721 internal nft;

    address internal owner = address(0xA11CE);
    address internal recipient = address(0xB0B);

    // Test fixture only; gateway retrieval and pinning must be verified independently.
    string internal constant TEST_METADATA_URI =
        "ipfs://QmY5TyncxWWHjKUqm3B8y59WHQ2QDfFpvogR71j95a1tAs";

    function setUp() public {
        nft = new GLORIFIERServicesLogo721(owner, TEST_METADATA_URI);
    }

    function testDeploymentDoesNotMint() public view {
        assertEq(nft.name(), unicode"GLORIFIER SERVICES — Official Logo #001");
        assertEq(nft.symbol(), "GLORIFIER-LOGO-001");
        assertFalse(nft.minted());
    }

    function testOwnerCanMintExactlyOneTokenWithConstructorMetadata() public {
        vm.prank(owner);
        nft.mint(recipient);

        assertTrue(nft.minted());
        assertEq(nft.ownerOf(1), recipient);
        assertEq(nft.tokenURI(1), TEST_METADATA_URI);
    }

    function testNonOwnerCannotMint() public {
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", recipient));
        vm.prank(recipient);
        nft.mint(recipient);
    }

    function testCannotMintTwice() public {
        vm.startPrank(owner);
        nft.mint(recipient);
        vm.expectRevert(GLORIFIERServicesLogo721.AlreadyMinted.selector);
        nft.mint(recipient);
        vm.stopPrank();
    }

    function testCannotMintToZeroAddress() public {
        vm.expectRevert(GLORIFIERServicesLogo721.InvalidRecipient.selector);
        vm.prank(owner);
        nft.mint(address(0));
    }

    function testEmptyMetadataURIRejected() public {
        vm.expectRevert(GLORIFIERServicesLogo721.InvalidMetadataURI.selector);
        new GLORIFIERServicesLogo721(owner, "");
    }

    function testTokenURIFailsBeforeMint() public {
        vm.expectRevert(abi.encodeWithSignature("ERC721NonexistentToken(uint256)", 1));
        nft.tokenURI(1);
    }
}

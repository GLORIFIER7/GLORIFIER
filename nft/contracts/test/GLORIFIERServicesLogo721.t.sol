// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GLORIFIERServicesLogo721} from "../src/GLORIFIERServicesLogo721.sol";

contract GLORIFIERServicesLogo721Test is Test {
    GLORIFIERServicesLogo721 internal nft;

    address internal owner = address(0xA11CE);
    address internal recipient = address(0xB0B);
    string internal constant APPROVED_METADATA_URI =
        "ipfs://QmZ1Na7Bdn23fKJdWK5JSvLTThTZ8j1r8W5SujHbVhX3wX";

    function setUp() public {
        nft = new GLORIFIERServicesLogo721(owner);
    }

    function testDeploymentDoesNotMint() public view {
        assertEq(nft.name(), unicode"GLORIFIER SERVICES — Official Logo #001");
        assertEq(nft.symbol(), "GLORIFIER-LOGO-001");
        assertFalse(nft.minted());
    }

    function testOwnerCanMintExactlyOneTokenWithApprovedMetadata() public {
        vm.prank(owner);
        nft.mint(recipient);

        assertTrue(nft.minted());
        assertEq(nft.ownerOf(1), recipient);
        assertEq(nft.tokenURI(1), APPROVED_METADATA_URI);
    }

    function testNonOwnerCannotMint() public {
        vm.expectRevert();
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

    function testTokenURIFailsBeforeMint() public {
        vm.expectRevert();
        nft.tokenURI(1);
    }
}

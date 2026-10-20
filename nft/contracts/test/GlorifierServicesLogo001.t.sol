// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {GlorifierServicesLogo001} from "../src/GlorifierServicesLogo001.sol";

/// @dev Legacy compatibility tests only. Do not use this duplicate contract for deployment.
contract GlorifierServicesLogo001Test is Test {
    GlorifierServicesLogo001 private token;

    address private owner = address(0xA11CE);
    address private recipient = address(0xB0B);

    string private constant METADATA_URI =
        "ipfs://QmY5TyncxWWHjKUqm3B8y59WHQ2QDfFpvogR71j95a1tAs";

    function setUp() public {
        vm.prank(owner);
        token = new GlorifierServicesLogo001(owner, METADATA_URI);
    }

    function testOwnerCanMintOnlyTokenOnce() public {
        vm.prank(owner);
        token.mintOnce(recipient);

        assertEq(token.ownerOf(1), recipient);
        assertEq(token.balanceOf(recipient), 1);
        assertTrue(token.minted());
    }

    function testSecondMintReverts() public {
        vm.prank(owner);
        token.mintOnce(recipient);

        vm.expectRevert(GlorifierServicesLogo001.AlreadyMinted.selector);
        vm.prank(owner);
        token.mintOnce(owner);
    }

    function testNonOwnerCannotMint() public {
        vm.expectRevert();
        vm.prank(recipient);
        token.mintOnce(recipient);
    }

    function testZeroRecipientRevertsWithoutMinting() public {
        vm.expectRevert(GlorifierServicesLogo001.InvalidRecipient.selector);
        vm.prank(owner);
        token.mintOnce(address(0));

        assertFalse(token.minted());
        assertEq(token.balanceOf(recipient), 0);
    }

    function testMetadataUriIsFixed() public {
        vm.prank(owner);
        token.mintOnce(recipient);

        assertEq(token.tokenURI(1), METADATA_URI);
    }

    function testUnknownTokenHasNoUri() public {
        vm.expectRevert();
        token.tokenURI(2);
    }

    function testZeroOwnerConstructorReverts() public {
        // OpenZeppelin Ownable validates the initial owner in its base constructor.
        vm.expectRevert();
        new GlorifierServicesLogo001(address(0), METADATA_URI);
    }

    function testEmptyMetadataUriConstructorReverts() public {
        vm.expectRevert(GlorifierServicesLogo001.EmptyMetadataURI.selector);
        new GlorifierServicesLogo001(owner, "");
    }
}

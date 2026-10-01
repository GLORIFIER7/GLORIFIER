// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GLORIFIER} from "../src/GLORIFIER.sol";

contract GLORIFIERTest is Test {
    GLORIFIER token;
    address holder = address(0xBEEF);
    address recipient = address(0xCAFE);

    function setUp() public {
        token = new GLORIFIER(holder);
    }

    function testMetadata() public view {
        assertEq(token.name(), "GLORIFIER");
        assertEq(token.symbol(), "GLR");
        assertEq(token.decimals(), 18);
    }

    function testInitialSupply() public view {
        assertEq(token.totalSupply(), 1_000_000_000 ether);
        assertEq(token.balanceOf(holder), 1_000_000_000 ether);
    }

    function testTransfer() public {
        vm.prank(holder);
        token.transfer(recipient, 100 ether);
        assertEq(token.balanceOf(recipient), 100 ether);
        assertEq(token.balanceOf(holder), 999_999_900 ether);
    }

    function testZeroHolderReverts() public {
        vm.expectRevert("GLORIFIER: zero holder");
        new GLORIFIER(address(0));
    }
}

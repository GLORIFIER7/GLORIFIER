// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title GLORIFIER
 * @notice Fixed-supply GLORIFIER utility token (GLR).
 *
 * Design goals:
 * - 1,000,000,000 GLR initial and maximum supply
 * - No owner
 * - No post-deployment minting
 * - No transfer tax
 * - No blacklist
 * - No upgradeability
 */
contract GLORIFIER is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 ether;

    constructor(address initialHolder) ERC20("GLORIFIER", "GLR") {
        require(initialHolder != address(0), "GLORIFIER: zero holder");
        _mint(initialHolder, INITIAL_SUPPLY);
    }
}

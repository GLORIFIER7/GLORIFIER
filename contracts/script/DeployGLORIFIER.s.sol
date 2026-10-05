// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {GLORIFIER} from "../src/GLORIFIER.sol";

contract DeployGLORIFIER is Script {
    function run() external returns (GLORIFIER token) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address initialHolder = vm.envAddress("GLORIFIER_INITIAL_HOLDER");
        uint256 gasPrice = vm.envUint("GLORIFIER_GAS_PRICE_WEI");

        vm.txGasPrice(gasPrice);
        vm.startBroadcast(deployerPrivateKey);
        token = new GLORIFIER(initialHolder);
        vm.stopBroadcast();
    }
}

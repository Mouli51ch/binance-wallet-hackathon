// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {PulseForecast} from "../src/PulseForecast.sol";
import {MockAgentId} from "../test/mocks/Mocks.sol";

/// Deploys PulseForecast and writes deployments/<network>.json.
///   testnet: forge script script/Deploy.s.sol --rpc-url $BSC_TESTNET_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify
///   mainnet: the same with $BSC_RPC_URL (T-A05, after the final name)
/// BSC testnet has no Agent ID, so testnet gets a MockAgentId where anyone can mark a wallet as a
/// holder with set(address, 1). Mainnet always uses the real Agent ID and refuses a mock.
contract Deploy is Script {
    address constant AGENT_ID_MAINNET = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    address constant FEED_MAINNET = 0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE;
    address constant FEED_TESTNET = 0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526;
    uint256 constant MAX_STALE = 2 hours; // spikes/F1: the midnight round was 0 to 24 s old on mainnet
    uint32 constant INITIAL_SIGMA_BPS = 250;

    function run() external returns (PulseForecast pf) {
        string memory network;
        address agentId;
        address feed;
        if (block.chainid == 56) {
            (network, agentId, feed) = ("mainnet", AGENT_ID_MAINNET, FEED_MAINNET);
        } else if (block.chainid == 97) {
            (network, feed) = ("testnet", FEED_TESTNET);
        } else {
            revert("Deploy: unknown chain. Use BSC mainnet (56) or BSC testnet (97).");
        }

        vm.startBroadcast();
        if (agentId == address(0)) agentId = address(new MockAgentId());
        pf = new PulseForecast(agentId, feed, MAX_STALE, INITIAL_SIGMA_BPS);
        vm.stopBroadcast();

        // A simulation (no --broadcast) must not leave a fake deployment file behind.
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            console.log("simulated only: PulseForecast would be at", address(pf));
            return pf;
        }

        string memory j = "deployment";
        vm.serializeUint(j, "chainId", block.chainid);
        vm.serializeUint(j, "block", block.number);
        vm.serializeAddress(j, "agentId", agentId);
        vm.serializeAddress(j, "feed", feed);
        string memory out = vm.serializeAddress(j, "PulseForecast", address(pf));
        string memory path = string.concat(vm.projectRoot(), "/../deployments/", network, ".json");
        vm.writeJson(out, path);
        console.log("PulseForecast", address(pf), "written to", path);
    }
}

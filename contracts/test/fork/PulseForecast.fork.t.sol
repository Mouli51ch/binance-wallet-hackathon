// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {PulseForecast} from "../../src/PulseForecast.sol";

/// BSC mainnet fork tests: the real Agent ID contract and the real Chainlink BNB/USD feed.
/// Needs an RPC that serves state at FORK_BLOCK (an archive node). Not run in CI.
///   forge test --match-path 'test/fork/*' -vv
/// Override the RPC with BSC_ARCHIVE_RPC_URL.
contract PulseForecastForkTest is Test {
    address constant AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    address constant FEED = 0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE;

    // 2026-11-24 about 06:00 UTC. HOLDER received an Agent ID at block 135410898 (a mint event).
    uint256 constant FORK_BLOCK = 135411040;
    address constant HOLDER = 0x7B3658eF53bD33c651aFB31fC7dB49619fe70d03;
    uint64 constant DAY = 20781; // 2026-11-24, the fork's UTC day
    // The round current at 2026-11-24 00:00 UTC, found by spikes/F1/find-rounds.mjs.
    uint80 constant MIDNIGHT_ROUND = 55340232221132271700;
    int256 constant MIDNIGHT_PRICE = 55602551231;

    PulseForecast pf;
    bytes32 constant SALT = keccak256("fork");

    function setUp() public {
        vm.createSelectFork(
            vm.envOr("BSC_ARCHIVE_RPC_URL", string("https://bsc-rpc.publicnode.com")), FORK_BLOCK
        );
        assertEq(block.timestamp / 1 days, DAY, "fork block is not on the expected UTC day");
        pf = new PulseForecast(AGENT_ID, FEED, 2 hours, 250);
    }

    function test_realHolderCanCommit() public {
        vm.prank(HOLDER);
        pf.commit(bytes32(uint256(1)));
        assertEq(pf.stats(HOLDER).daysCommitted, 1);
    }

    function test_freshAddressRefused() public {
        vm.prank(makeAddr("fresh"));
        vm.expectRevert(PulseForecast.NotAgentIdHolder.selector);
        pf.commit(bytes32(uint256(1)));
    }

    function test_settleWithRealMidnightRound() public {
        pf.settle(DAY - 1, MIDNIGHT_ROUND);
        assertEq(pf.boundaryPrice(DAY), MIDNIGHT_PRICE);
    }

    function test_realFeedRefusesTheRoundBefore() public {
        vm.expectRevert(PulseForecast.RoundNotCurrent.selector);
        pf.settle(DAY - 1, MIDNIGHT_ROUND - 1);
    }

    /// Gas of the daily call on real contracts. Future boundaries do not exist on the fork, so
    /// their rounds are mocked on the real feed address.
    function test_gasOfDailySubmit() public {
        pf.settle(DAY - 1, MIDNIGHT_ROUND);
        bytes32 h1 = pf.commitHash(HOLDER, DAY + 1, -240, 30, 290, SALT);
        vm.prank(HOLDER);
        uint256 g0 = gasleft();
        pf.submit(h1, false, 0, 0, 0, bytes32(0));
        console.log("submit, first commit only:", g0 - gasleft());

        _mockBoundary(DAY + 1, MIDNIGHT_PRICE * 101 / 100, 9001);
        vm.warp(uint256(DAY + 1) * 1 days + 1 hours);
        pf.settle(DAY, 9001);

        bytes32 h2 = pf.commitHash(HOLDER, DAY + 2, -200, 0, 250, SALT);
        vm.prank(HOLDER);
        g0 = gasleft();
        pf.submit(h2, true, -240, 30, 290, SALT);
        console.log("submit, reveal + commit:", g0 - gasleft());

        _mockBoundary(DAY + 2, MIDNIGHT_PRICE, 9002);
        vm.warp(uint256(DAY + 2) * 1 days + 1 hours);
        g0 = gasleft();
        pf.settle(DAY + 1, 9002);
        console.log("settle:", g0 - gasleft());

        bytes32 h3 = pf.commitHash(HOLDER, DAY + 3, -200, 0, 250, SALT);
        vm.prank(HOLDER);
        g0 = gasleft();
        pf.submit(h3, true, -200, 0, 250, SALT);
        console.log("submit, reveal + commit + score:", g0 - gasleft());
        assertEq(pf.stats(HOLDER).daysScored, 1);
    }

    function _mockBoundary(uint64 day, int256 price, uint80 id) private {
        uint256 t = uint256(day) * 1 days - 30;
        vm.mockCall(
            FEED,
            abi.encodeWithSignature("getRoundData(uint80)", id),
            abi.encode(id, price, t, t, id)
        );
        vm.mockCallRevert(FEED, abi.encodeWithSignature("getRoundData(uint80)", id + 1), "");
        vm.mockCall(
            FEED, abi.encodeWithSignature("latestRoundData()"), abi.encode(id, price, t, t, id)
        );
    }
}

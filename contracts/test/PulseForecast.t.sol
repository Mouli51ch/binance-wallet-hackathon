// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PulseForecast} from "../src/PulseForecast.sol";
import {MockAgentId, MockFeed} from "./mocks/Mocks.sol";

contract PulseForecastTest is Test {
    PulseForecast pf;
    MockAgentId agentId;
    MockFeed feed;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address stranger = makeAddr("stranger");

    uint64 constant D0 = 20400; // a UTC day index, all tests start inside it
    uint64 constant MAX_STALE = 2 hours;
    uint32 constant SIGMA = 250; // bps per day
    bytes32 constant SALT = keccak256("salt");

    // The worked example in docs/ARCHITECTURE.md: -2.4% / +0.3% / +2.9%, outcome +1.0%.
    int32 constant A10 = -240;
    int32 constant A50 = 30;
    int32 constant A90 = 290;

    function setUp() public {
        agentId = new MockAgentId();
        feed = new MockFeed();
        pf = new PulseForecast(address(agentId), address(feed), MAX_STALE, SIGMA);
        agentId.set(alice, 1);
        agentId.set(bob, 1);
        vm.warp(uint256(D0) * 1 days + 1 hours);
    }

    // ---------- helpers ----------

    function _at(uint64 day) internal {
        vm.warp(uint256(day) * 1 days + 1 hours);
    }

    /// Price at the start of `boundaryDay`: round b*10 just before, round b*10+1 just after.
    function _price(uint64 boundaryDay, int256 price) internal returns (uint80 id) {
        uint256 b = uint256(boundaryDay) * 1 days;
        id = uint80(boundaryDay) * 10;
        feed.setRound(id, price, b - 60);
        feed.setRound(id + 1, price, b + 60);
    }

    function _hash(address who, uint64 day, int32 a, int32 b, int32 c) internal view returns (bytes32) {
        return pf.commitHash(who, day, a, b, c, SALT);
    }

    /// alice commits for D0+1 on D0, reveals on D0+1; day D0+1 settles with open 600, close 606 (+1%).
    function _aliceDay(bool doReveal) internal {
        vm.prank(alice);
        pf.commit(_hash(alice, D0 + 1, A10, A50, A90));
        _at(D0 + 1);
        if (doReveal) {
            vm.prank(alice);
            pf.reveal(A10, A50, A90, SALT);
        }
        _settleDay(D0 + 1, 600e8, 606e8);
    }

    function _settleDay(uint64 day, int256 open, int256 close) internal {
        uint80 r0 = _price(day, open);
        uint80 r1 = _price(day + 1, close);
        _at(day + 1);
        pf.settle(day - 1, r0);
        pf.settle(day, r1);
    }

    // ---------- commit ----------

    function test_holderCanCommitForTomorrow() public {
        bytes32 h = _hash(alice, D0 + 1, A10, A50, A90);
        vm.expectEmit(address(pf));
        emit PulseForecast.Committed(alice, D0 + 1);
        vm.prank(alice);
        pf.commit(h);
        assertEq(pf.forecastOf(alice, D0 + 1).hash, h);
        assertEq(pf.stats(alice).daysCommitted, 1);
    }

    function test_nonHolderCannotCommit() public {
        vm.prank(stranger);
        vm.expectRevert(PulseForecast.NotAgentIdHolder.selector);
        pf.commit(bytes32(uint256(1)));
    }

    function test_doubleCommitRefused() public {
        vm.startPrank(alice);
        pf.commit(bytes32(uint256(1)));
        vm.expectRevert(PulseForecast.AlreadyCommitted.selector);
        pf.commit(bytes32(uint256(2)));
        vm.stopPrank();
    }

    function test_emptyCommitRefused() public {
        vm.prank(alice);
        vm.expectRevert(PulseForecast.EmptyCommit.selector);
        pf.commit(bytes32(0));
    }

    // ---------- reveal ----------

    function test_revealMatchesHash() public {
        vm.prank(alice);
        pf.commit(_hash(alice, D0 + 1, A10, A50, A90));
        _at(D0 + 1);
        vm.expectEmit(address(pf));
        emit PulseForecast.Revealed(alice, D0 + 1, A10, A50, A90);
        vm.prank(alice);
        pf.reveal(A10, A50, A90, SALT);
        PulseForecast.Forecast memory f = pf.forecastOf(alice, D0 + 1);
        assertTrue(f.revealed);
        assertEq(f.p50, A50);
    }

    function test_revealWrongSaltRefused() public {
        vm.prank(alice);
        pf.commit(_hash(alice, D0 + 1, A10, A50, A90));
        _at(D0 + 1);
        vm.prank(alice);
        vm.expectRevert(PulseForecast.HashMismatch.selector);
        pf.reveal(A10, A50, A90, keccak256("other"));
    }

    function test_revealWrongNumbersRefused() public {
        vm.prank(alice);
        pf.commit(_hash(alice, D0 + 1, A10, A50, A90));
        _at(D0 + 1);
        vm.prank(alice);
        vm.expectRevert(PulseForecast.HashMismatch.selector);
        pf.reveal(A10, A50 + 1, A90, SALT);
    }

    function test_revealOnCommitDayRefused() public {
        vm.startPrank(alice);
        pf.commit(_hash(alice, D0 + 1, A10, A50, A90));
        vm.expectRevert(PulseForecast.NoCommit.selector); // still D0, nothing committed for D0
        pf.reveal(A10, A50, A90, SALT);
        vm.stopPrank();
    }

    function test_revealAfterItsDayRefused() public {
        vm.prank(alice);
        pf.commit(_hash(alice, D0 + 1, A10, A50, A90));
        _at(D0 + 2);
        vm.prank(alice);
        vm.expectRevert(PulseForecast.NoCommit.selector);
        pf.reveal(A10, A50, A90, SALT);
    }

    function test_doubleRevealRefused() public {
        vm.prank(alice);
        pf.commit(_hash(alice, D0 + 1, A10, A50, A90));
        _at(D0 + 1);
        vm.startPrank(alice);
        pf.reveal(A10, A50, A90, SALT);
        vm.expectRevert(PulseForecast.AlreadyRevealed.selector);
        pf.reveal(A10, A50, A90, SALT);
        vm.stopPrank();
    }

    function test_someoneElsesHashCannotBeReplayed() public {
        // bob copies alice's hash; his reveal of her numbers fails because the voter is in the hash
        bytes32 aliceHash = _hash(alice, D0 + 1, A10, A50, A90);
        vm.prank(bob);
        pf.commit(aliceHash);
        _at(D0 + 1);
        vm.prank(bob);
        vm.expectRevert(PulseForecast.HashMismatch.selector);
        pf.reveal(A10, A50, A90, SALT);
    }

    function test_unorderedQuantilesRefused() public {
        vm.prank(alice);
        pf.commit(_hash(alice, D0 + 1, 100, 50, 200));
        _at(D0 + 1);
        vm.prank(alice);
        vm.expectRevert(PulseForecast.BadOrder.selector);
        pf.reveal(100, 50, 200, SALT);
    }

    function test_outOfRangeRefused() public {
        vm.prank(alice);
        pf.commit(_hash(alice, D0 + 1, -5001, 0, 100));
        _at(D0 + 1);
        vm.prank(alice);
        vm.expectRevert(PulseForecast.OutOfRange.selector);
        pf.reveal(-5001, 0, 100, SALT);
    }

    // ---------- settle ----------

    function test_settleBeforeBoundaryRefused() public {
        uint80 r = _price(D0 + 1, 600e8);
        vm.expectRevert(PulseForecast.TooEarly.selector);
        pf.settle(D0, r); // boundary D0+1 has not happened yet
    }

    function test_settleWithRoundAfterBoundaryRefused() public {
        uint80 r = _price(D0 + 1, 600e8);
        _at(D0 + 1);
        vm.expectRevert(PulseForecast.RoundAfterBoundary.selector);
        pf.settle(D0, r + 1);
    }

    function test_settleWithOlderRoundRefused() public {
        uint256 b = uint256(D0 + 1) * 1 days;
        feed.setRound(100, 600e8, b - 120);
        feed.setRound(101, 601e8, b - 60); // 101 was the current round at the boundary, not 100
        feed.setRound(102, 602e8, b + 60);
        _at(D0 + 1);
        vm.expectRevert(PulseForecast.RoundNotCurrent.selector);
        pf.settle(D0, 100);
        pf.settle(D0, 101);
        assertEq(pf.boundaryPrice(D0 + 1), 601e8);
    }

    function test_settleWithLatestRoundAccepted() public {
        uint256 b = uint256(D0 + 1) * 1 days;
        feed.setRound(7, 600e8, b - 60); // no round after it yet
        _at(D0 + 1);
        pf.settle(D0, 7);
        assertEq(pf.boundaryPrice(D0 + 1), 600e8);
    }

    function test_settleTwiceRefused() public {
        uint80 r = _price(D0 + 1, 600e8);
        _at(D0 + 1);
        pf.settle(D0, r);
        vm.expectRevert(PulseForecast.AlreadySettled.selector);
        pf.settle(D0, r);
    }

    function test_staleRoundVoidsTheDay() public {
        _aliceDay(true);
        // re-run the same flow for D0+2 with a price older than maxStale at the closing boundary
        uint256 b = uint256(D0 + 3) * 1 days;
        feed.setRound(999000, 610e8, b - 3 hours); // highest id, so it is the latest round
        _at(D0 + 3);
        pf.settle(D0 + 2, 999000);
        assertEq(pf.dayInfo(D0 + 2).status, pf.VOID());
        vm.expectRevert(PulseForecast.DayVoid.selector);
        pf.score(alice, D0 + 2);
    }

    // ---------- scoring ----------

    function test_pinballKnownCases() public view {
        // units are tenths of a basis point
        assertEq(pf.pinballLoss(A10, A50, A90, 100), 880); // the documented example, 0.88%
        assertEq(pf.pinballLoss(100, 100, 100, 100), 0); // dead on
        assertEq(pf.pinballLoss(-100, 0, 100, -300), 9 * 200 + 5 * 300 + 1 * 400); // below p10
        assertEq(pf.pinballLoss(-100, 0, 100, 300), 1 * 400 + 5 * 300 + 9 * 200); // above p90
    }

    function test_revealedForecastScoredAgainstOutcome() public {
        _aliceDay(true);
        PulseForecast.DayInfo memory d = pf.dayInfo(D0 + 1);
        assertEq(d.status, pf.SETTLED());
        assertEq(d.changeBps, 100);
        assertEq(d.sigmaBps, 250);
        assertEq(d.baselineLoss, 1140); // baseline -320/0/+320 at +100

        vm.expectEmit(address(pf));
        emit PulseForecast.Scored(alice, D0 + 1, 880, 1140, true);
        pf.score(alice, D0 + 1);
        PulseForecast.Stats memory s = pf.stats(alice);
        assertEq(s.daysScored, 1);
        assertEq(s.totalLoss, 880);
        assertEq(s.totalBaselineLoss, 1140);
        assertEq(s.daysInBand, 1);
        assertEq(s.beatStreak, 1);
        assertEq(s.lastScoredDay, D0 + 1);
    }

    function test_scoreTwiceRefused() public {
        _aliceDay(true);
        pf.score(alice, D0 + 1);
        vm.expectRevert(PulseForecast.AlreadyScored.selector);
        pf.score(alice, D0 + 1);
    }

    function test_scoreUnsettledDayRefused() public {
        vm.prank(alice);
        pf.commit(_hash(alice, D0 + 1, A10, A50, A90));
        vm.expectRevert(PulseForecast.DayNotSettled.selector);
        pf.score(alice, D0 + 1);
    }

    function test_unrevealedCommitPaysTwiceBaseline() public {
        _aliceDay(false);
        pf.score(alice, D0 + 1);
        PulseForecast.Stats memory s = pf.stats(alice);
        assertEq(s.totalLoss, 2 * 1140);
        assertEq(s.missedReveals, 1);
        assertEq(s.daysInBand, 0);
        assertEq(s.beatStreak, 0);
    }

    function test_baselineSigmaUpdatesAfterSettle() public {
        _aliceDay(true);
        // variance 250^2 = 62500 -> (94 * 62500 + 6 * 100^2) / 100 = 59350 -> sigma 243
        (int32 lo, int32 mid, int32 hi) = pf.baselineBand(D0 + 2);
        assertEq(mid, 0);
        assertEq(hi, 311); // 243 * 1.2816
        assertEq(lo, -311);
        // a settled day keeps the sigma it was scored with
        (, , hi) = pf.baselineBand(D0 + 1);
        assertEq(hi, 320);
    }

    function test_crowdBandIsTheAverage() public {
        vm.prank(alice);
        pf.commit(_hash(alice, D0 + 1, A10, A50, A90));
        vm.prank(bob);
        pf.commit(_hash(bob, D0 + 1, -100, 50, 200));
        _at(D0 + 1);
        vm.prank(alice);
        pf.reveal(A10, A50, A90, SALT);
        vm.prank(bob);
        pf.reveal(-100, 50, 200, SALT);

        (int32 lo, int32 mid, int32 hi, uint32 n) = pf.crowdBand(D0 + 1);
        assertEq(n, 2);
        assertEq(lo, -170);
        assertEq(mid, 40);
        assertEq(hi, 245);

        _settleDay(D0 + 1, 600e8, 606e8);
        assertEq(pf.dayInfo(D0 + 1).crowdLoss, 270 + 300 + 145);
    }

    function test_submitRevealsCommitsAndScoresInOneTx() public {
        _aliceDay(true); // committed via commit(), revealed, D0+1 settled; now inside D0+2
        // she also needs a commit for D0+2 to reveal today: give her one from yesterday's slot
        // by running the one-tx path from here on
        bytes32 next = _hash(alice, D0 + 3, -50, 0, 60);
        vm.prank(alice);
        pf.submit(next, false, 0, 0, 0, bytes32(0)); // nothing to reveal today, commit D0+3, score D0+1
        assertEq(pf.stats(alice).daysScored, 1);
        assertEq(pf.forecastOf(alice, D0 + 3).hash, next);

        _at(D0 + 3);
        bytes32 next2 = _hash(alice, D0 + 4, -60, 0, 70);
        vm.prank(alice);
        pf.submit(next2, true, -50, 0, 60, SALT);
        assertTrue(pf.forecastOf(alice, D0 + 3).revealed);
        assertEq(pf.forecastOf(alice, D0 + 4).hash, next2);
        assertEq(pf.stats(alice).daysCommitted, 3);
    }

    function test_submitWithNothingToDoRefused() public {
        vm.prank(alice);
        vm.expectRevert(PulseForecast.NothingToDo.selector);
        pf.submit(bytes32(0), false, 0, 0, 0, bytes32(0));
    }

    function test_noOwnerNoPayable() public {
        // sending BNB to the contract fails: no receive, no payable function
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(pf).call{value: 1}("");
        assertFalse(ok);
    }
}

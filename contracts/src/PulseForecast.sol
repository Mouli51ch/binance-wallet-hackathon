// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IAgentId {
    function balanceOf(address owner) external view returns (uint256);
}

interface IAggregatorV3 {
    function getRoundData(uint80 roundId)
        external
        view
        returns (uint80 roundId_, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function latestRoundData()
        external
        view
        returns (uint80 roundId_, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title PulseForecast
/// @notice One BNB forecast per Binance Agent ID holder per UTC day: p10, p50 and p90 of the
/// day's % change in basis points, committed the day before and revealed on the day, settled
/// against Chainlink BNB/USD and scored with pinball loss against a no-change baseline.
/// Forecasting signal only. Not financial advice.
/// @dev No owner, no admin, no pause, no upgrades, no payable, holds and moves no assets.
/// Every function is O(1): nothing loops over forecasters. Design: docs/ARCHITECTURE.md section 5.
/// Losses are in tenths of a basis point.
contract PulseForecast {
    // ---------- types ----------

    struct Forecast {
        bytes32 hash;
        int32 p10;
        int32 p50;
        int32 p90;
        bool revealed;
        bool scored;
    }

    struct DayInfo {
        uint8 status; // PENDING, SETTLED or VOID
        int32 changeBps; // BNB/USD change over the day
        uint32 sigmaBps; // baseline volatility used for this day
        uint32 reveals; // forecasts revealed for this day
        int256 openPrice; // Chainlink answer at the day's start, 8 decimals
        int256 closePrice; // Chainlink answer at the next day's start
        uint256 crowdLoss; // pinball loss of the averaged crowd band
        uint256 baselineLoss; // pinball loss of the baseline band
    }

    struct Stats {
        uint32 daysCommitted;
        uint32 daysScored;
        uint32 missedReveals;
        uint32 daysInBand; // outcome inside the holder's own p10 to p90
        uint32 beatStreak; // consecutive scored days below the baseline's loss
        uint64 lastScoredDay;
        uint128 totalLoss;
        uint128 totalBaselineLoss;
    }

    struct Boundary {
        int256 price;
        bool set;
        bool stale;
    }

    struct Sums {
        int64 p10;
        int64 p50;
        int64 p90;
    }

    // ---------- constants and config ----------

    uint8 public constant PENDING = 0;
    uint8 public constant SETTLED = 1;
    uint8 public constant VOID = 2;

    /// Each quantile must stay within +-50%.
    int32 public constant MAX_BPS = 5000;
    /// z-score of the 90th percentile of a normal distribution, times 10000.
    uint256 private constant Z90 = 12816;
    /// Outcomes are clamped to this many bps so the int32 maths cannot overflow.
    int256 private constant MAX_CHANGE = 1_000_000;

    IAgentId public immutable agentId;
    IAggregatorV3 public immutable feed;
    /// Oldest a Chainlink round may be at a day boundary; older voids the day.
    uint256 public immutable maxStale;
    /// UTC day of deployment. Boundaries before it can never be recorded.
    uint64 public immutable startDay;

    // ---------- state ----------

    /// EWMA of the squared daily change, in bps squared.
    uint256 public variance;
    /// The only boundary settle() accepts next. Boundaries are recorded strictly in order, so
    /// nobody can replay old days into the volatility estimate or finalise days out of order.
    uint64 public nextBoundary;

    mapping(address => mapping(uint64 => Forecast)) private _forecasts;
    mapping(address => Stats) private _stats;
    mapping(uint64 => DayInfo) private _days;
    mapping(uint64 => Sums) private _sums;
    mapping(uint64 => Boundary) private _boundaries;

    // ---------- events ----------

    event Committed(address indexed voter, uint64 indexed day);
    event Revealed(address indexed voter, uint64 indexed day, int32 p10, int32 p50, int32 p90);
    event Settled(
        uint64 indexed day,
        int256 openPrice,
        int256 closePrice,
        int32 changeBps,
        uint256 crowdLoss,
        uint256 baselineLoss
    );
    event Scored(
        address indexed voter, uint64 indexed day, uint256 loss, uint256 baselineLoss, bool inBand
    );

    // ---------- errors: each names the cause; the comment says what to do next ----------

    /// The constructor got a zero address, a non-contract, or a zero maxStale or sigma. Fix the deploy args.
    error BadConfig();
    /// This wallet holds no Agent ID. Claim one in the Binance App, then send from that wallet.
    error NotAgentIdHolder();
    /// This wallet already committed for tomorrow. Wait for tomorrow and reveal it.
    error AlreadyCommitted();
    /// The commit hash is zero. Build it with commitHash().
    error EmptyCommit();
    /// No commit exists for today. Commits are for tomorrow; reveal on the day you committed for.
    error NoCommit();
    /// Today's forecast is already revealed. Nothing more to do today.
    error AlreadyRevealed();
    /// The numbers or salt do not match the commit. Reveal exactly what was committed, with its salt.
    error HashMismatch();
    /// p10 <= p50 <= p90 is required. Reorder the numbers.
    error BadOrder();
    /// Each number must be within +-5000 bps (+-50%). Use a smaller range.
    error OutOfRange();
    /// The day boundary has not happened yet. Settle after 00:00 UTC.
    error TooEarly();
    /// Boundaries are recorded in order. Call settle(nextBoundary() - 1, roundId) first.
    error SettleInOrder();
    /// The round was updated after the boundary. Use the last round updated at or before it.
    error RoundAfterBoundary();
    /// A newer round was also before the boundary. Use the last round updated at or before it.
    error RoundNotCurrent();
    /// The feed returned no data or a non-positive price for this round. Use another round id.
    error BadPrice();
    /// The day has no outcome yet. Settle it first.
    error DayNotSettled();
    /// The day was voided because Chainlink was stale. Nobody is scored for it.
    error DayVoid();
    /// This wallet did not commit for that day. Nothing to score.
    error NothingToScore();
    /// This forecast is already scored. Nothing to do.
    error AlreadyScored();
    /// submit() was called with nothing to reveal and nothing to commit. Pass one of them.
    error NothingToDo();

    constructor(address agentId_, address feed_, uint256 maxStale_, uint32 initialSigmaBps) {
        if (
            agentId_.code.length == 0 || feed_.code.length == 0 || maxStale_ == 0
                || initialSigmaBps == 0
        ) revert BadConfig();
        agentId = IAgentId(agentId_);
        feed = IAggregatorV3(feed_);
        maxStale = maxStale_;
        startDay = uint64(block.timestamp / 1 days);
        nextBoundary = startDay;
        variance = uint256(initialSigmaBps) * initialSigmaBps;
    }

    // ---------- forecaster actions ----------

    /// @notice The daily one-transaction call: reveal today's forecast (if hasReveal), commit
    /// tomorrow's (if nextCommit is non-zero), then score yesterday if it is settled.
    function submit(
        bytes32 nextCommit,
        bool hasReveal,
        int32 p10,
        int32 p50,
        int32 p90,
        bytes32 salt
    ) external {
        if (!hasReveal && nextCommit == bytes32(0)) revert NothingToDo();
        uint64 d = today();
        if (hasReveal) _reveal(d, p10, p50, p90, salt);
        if (nextCommit != bytes32(0)) _commit(d + 1, nextCommit);
        uint64 y = d - 1;
        Forecast storage f = _forecasts[msg.sender][y];
        if (_days[y].status == SETTLED && f.hash != bytes32(0) && !f.scored) _score(msg.sender, y);
    }

    /// @notice Commit a hash of tomorrow's forecast. See commitHash().
    function commit(bytes32 hash) external {
        _commit(today() + 1, hash);
    }

    /// @notice Reveal today's committed forecast.
    function reveal(int32 p10, int32 p50, int32 p90, bytes32 salt) external {
        _reveal(today(), p10, p50, p90, salt);
    }

    // ---------- permissionless upkeep ----------

    /// @notice Record the Chainlink price at the end of `day` (00:00 UTC of day + 1) using
    /// `roundId`, which must be the round that was current at that moment. Finalises `day`
    /// once both of its boundary prices are known. Boundaries go strictly in order from the
    /// deploy day; see nextBoundary. Anyone can call it.
    function settle(uint64 day, uint80 roundId) external {
        uint64 b = day + 1;
        uint256 t = uint256(b) * 1 days;
        if (block.timestamp < t) revert TooEarly();
        if (b != nextBoundary) revert SettleInOrder();
        nextBoundary = b + 1;

        (, int256 answer,, uint256 updatedAt,) = feed.getRoundData(roundId);
        if (updatedAt == 0 || answer <= 0) revert BadPrice();
        if (updatedAt > t) revert RoundAfterBoundary();
        try feed.getRoundData(roundId + 1) returns (uint80, int256, uint256, uint256 nextAt, uint80) {
            if (nextAt == 0) _requireLatest(roundId, t);
            else if (nextAt <= t) revert RoundNotCurrent();
        } catch {
            _requireLatest(roundId, t);
        }

        _boundaries[b] = Boundary({price: answer, set: true, stale: t - updatedAt > maxStale});
        _finalize(day);
    }

    /// @notice Score one holder's settled day. Anyone can call it.
    function score(address voter, uint64 day) external {
        uint8 s = _days[day].status;
        if (s == VOID) revert DayVoid();
        if (s != SETTLED) revert DayNotSettled();
        Forecast storage f = _forecasts[voter][day];
        if (f.hash == bytes32(0)) revert NothingToScore();
        if (f.scored) revert AlreadyScored();
        _score(voter, day);
    }

    // ---------- views ----------

    /// @notice The current UTC day index (unix time / 86400).
    function today() public view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }

    /// @notice The commit hash the contract expects. Including voter and day stops replays.
    function commitHash(address voter, uint64 day, int32 p10, int32 p50, int32 p90, bytes32 salt)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(voter, day, p10, p50, p90, salt));
    }

    /// @notice Pinball loss of a p10/p50/p90 forecast against outcome y, in tenths of a bps.
    function pinballLoss(int32 p10, int32 p50, int32 p90, int32 y) public pure returns (uint256) {
        return _pin(1, p10, y) + _pin(5, p50, y) + _pin(9, p90, y);
    }

    function dayInfo(uint64 day) external view returns (DayInfo memory) {
        return _days[day];
    }

    /// @notice Average of the revealed p10s, p50s and p90s for `day`, and how many were revealed.
    function crowdBand(uint64 day) public view returns (int32 p10, int32 p50, int32 p90, uint32 n) {
        n = _days[day].reveals;
        if (n == 0) return (0, 0, 0, 0);
        Sums memory s = _sums[day];
        p10 = int32(s.p10 / int64(uint64(n)));
        p50 = int32(s.p50 / int64(uint64(n)));
        p90 = int32(s.p90 / int64(uint64(n)));
    }

    /// @notice The baseline band: no change, +-1.2816 sigma. A settled day keeps its own sigma.
    function baselineBand(uint64 day) public view returns (int32 p10, int32 p50, int32 p90) {
        DayInfo storage d = _days[day];
        uint256 sigma = d.status == SETTLED ? d.sigmaBps : _sqrt(variance);
        int32 half = int32(int256(sigma * Z90 / 10000));
        return (-half, 0, half);
    }

    function stats(address voter) external view returns (Stats memory) {
        return _stats[voter];
    }

    function forecastOf(address voter, uint64 day) external view returns (Forecast memory) {
        return _forecasts[voter][day];
    }

    /// @notice Recorded Chainlink price at 00:00 UTC of `day`, 0 if not recorded yet.
    function boundaryPrice(uint64 day) external view returns (int256) {
        return _boundaries[day].price;
    }

    // ---------- internals ----------

    function _commit(uint64 day, bytes32 hash) private {
        if (hash == bytes32(0)) revert EmptyCommit();
        if (agentId.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();
        Forecast storage f = _forecasts[msg.sender][day];
        if (f.hash != bytes32(0)) revert AlreadyCommitted();
        f.hash = hash;
        _stats[msg.sender].daysCommitted += 1;
        emit Committed(msg.sender, day);
    }

    function _reveal(uint64 day, int32 p10, int32 p50, int32 p90, bytes32 salt) private {
        Forecast storage f = _forecasts[msg.sender][day];
        if (f.hash == bytes32(0)) revert NoCommit();
        if (f.revealed) revert AlreadyRevealed();
        if (p10 > p50 || p50 > p90) revert BadOrder();
        if (p10 < -MAX_BPS || p90 > MAX_BPS) revert OutOfRange();
        if (commitHash(msg.sender, day, p10, p50, p90, salt) != f.hash) revert HashMismatch();

        f.p10 = p10;
        f.p50 = p50;
        f.p90 = p90;
        f.revealed = true;
        Sums storage s = _sums[day];
        s.p10 += p10;
        s.p50 += p50;
        s.p90 += p90;
        _days[day].reveals += 1;
        emit Revealed(msg.sender, day, p10, p50, p90);
    }

    function _score(address voter, uint64 day) private {
        Forecast storage f = _forecasts[voter][day];
        DayInfo storage d = _days[day];
        f.scored = true;

        uint256 base = d.baselineLoss;
        uint256 loss;
        bool inBand;
        Stats storage st = _stats[voter];
        if (f.revealed) {
            loss = pinballLoss(f.p10, f.p50, f.p90, d.changeBps);
            inBand = f.p10 <= d.changeBps && d.changeBps <= f.p90;
            if (inBand) st.daysInBand += 1;
        } else {
            // Not revealing costs 2x the baseline. A holder can still skip a reveal that would cost
            // more, so missed reveals are counted and shown next to every record (DECISIONS.md).
            loss = 2 * base;
            st.missedReveals += 1;
        }
        st.daysScored += 1;
        st.totalLoss += uint128(loss);
        st.totalBaselineLoss += uint128(base);
        // Only a newer day moves the streak, so nobody can reorder someone's scoring to reset it.
        if (day > st.lastScoredDay) {
            st.beatStreak = loss < base ? st.beatStreak + 1 : 0;
            st.lastScoredDay = day;
        }
        emit Scored(voter, day, loss, base, inBand);
    }

    /// Settles `day` once both boundary prices exist. Void if either was stale.
    function _finalize(uint64 day) private {
        DayInfo storage d = _days[day];
        if (d.status != PENDING) return;
        Boundary memory o = _boundaries[day];
        Boundary memory c = _boundaries[day + 1];
        if (!o.set || !c.set) return;
        if (o.stale || c.stale) {
            d.status = VOID;
            return;
        }

        int256 raw = (c.price - o.price) * 10000 / o.price;
        if (raw > MAX_CHANGE) raw = MAX_CHANGE;
        if (raw < -MAX_CHANGE) raw = -MAX_CHANGE;
        int32 y = int32(raw);

        uint256 sigma = _sqrt(variance);
        int32 half = int32(int256(sigma * Z90 / 10000));
        uint256 base = pinballLoss(-half, 0, half, y);
        uint256 crowd;
        if (d.reveals > 0) {
            (int32 c10, int32 c50, int32 c90,) = crowdBand(day);
            crowd = pinballLoss(c10, c50, c90, y);
        }

        d.status = SETTLED;
        d.changeBps = y;
        d.sigmaBps = uint32(sigma);
        d.openPrice = o.price;
        d.closePrice = c.price;
        d.crowdLoss = crowd;
        d.baselineLoss = base;
        // EWMA: sigma^2 <- 0.94 sigma^2 + 0.06 change^2
        variance = (94 * variance + 6 * uint256(raw * raw)) / 100;
        emit Settled(day, o.price, c.price, y, crowd, base);
    }

    /// roundId has no successor in its phase: it must be the latest round, or the last round of
    /// its phase with the next phase's first round updated after the boundary.
    function _requireLatest(uint80 roundId, uint256 t) private view {
        (uint80 latest,,,,) = feed.latestRoundData();
        if (latest == roundId) return;
        uint80 nextPhaseFirst = uint80((((uint256(roundId) >> 64) + 1) << 64) | 1);
        try feed.getRoundData(nextPhaseFirst) returns (uint80, int256, uint256, uint256 at, uint80) {
            if (at > t) return;
        } catch {}
        revert RoundNotCurrent();
    }

    /// One quantile's pinball loss, times 10. qTenths is 1, 5 or 9.
    function _pin(int256 qTenths, int32 x, int32 y) private pure returns (uint256) {
        int256 diff = int256(y) - int256(x);
        return diff >= 0 ? uint256(qTenths * diff) : uint256((10 - qTenths) * -diff);
    }

    /// Integer square root, rounded down. Unrolled Newton steps, no loop.
    function _sqrt(uint256 a) private pure returns (uint256) {
        if (a == 0) return 0;
        uint256 x = a;
        uint256 r = 1;
        if (x >= 1 << 128) { x >>= 128; r <<= 64; }
        if (x >= 1 << 64) { x >>= 64; r <<= 32; }
        if (x >= 1 << 32) { x >>= 32; r <<= 16; }
        if (x >= 1 << 16) { x >>= 16; r <<= 8; }
        if (x >= 1 << 8) { x >>= 8; r <<= 4; }
        if (x >= 1 << 4) { x >>= 4; r <<= 2; }
        if (x >= 1 << 2) r <<= 1;
        r = (r + a / r) >> 1;
        r = (r + a / r) >> 1;
        r = (r + a / r) >> 1;
        r = (r + a / r) >> 1;
        r = (r + a / r) >> 1;
        r = (r + a / r) >> 1;
        r = (r + a / r) >> 1;
        uint256 r2 = a / r;
        return r < r2 ? r : r2;
    }
}

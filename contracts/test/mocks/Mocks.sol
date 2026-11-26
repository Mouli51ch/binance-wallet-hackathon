// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Stand-in for the Agent ID ERC-721: only balanceOf matters to PulseForecast.
contract MockAgentId {
    mapping(address => uint256) public balanceOf;

    function set(address who, uint256 n) external {
        balanceOf[who] = n;
    }
}

/// Stand-in for a Chainlink AggregatorV3 proxy. A missing round reverts, like the real proxy.
contract MockFeed {
    struct Round {
        int256 answer;
        uint256 updatedAt;
    }

    mapping(uint80 => Round) public rounds;
    uint80 public latest;

    function setRound(uint80 id, int256 answer, uint256 updatedAt) external {
        rounds[id] = Round(answer, updatedAt);
        if (id > latest) latest = id;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function getRoundData(uint80 id)
        public
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        Round memory r = rounds[id];
        require(r.updatedAt != 0, "No data present");
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return getRoundData(latest);
    }
}

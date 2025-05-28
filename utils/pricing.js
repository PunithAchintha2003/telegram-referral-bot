// utils/pricing.js

// Renamed from VIP_COST to GOLD_COST
const { GOLD_COST } = require('../constants');

// Renamed from getVipCost to getGoldCost
function getGoldCost(level) {
    return GOLD_COST[level] || 0; // Return 0 if level not found
}

module.exports = {
    getGoldCost // Export new name
};

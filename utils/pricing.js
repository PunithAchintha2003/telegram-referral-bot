// utils/pricing.js
const { VIP_COST } = require('../constants');

function getVipCost(level) {
    return VIP_COST[level] || 0; // Return 0 if level not found
}

module.exports = {
    getVipCost
};
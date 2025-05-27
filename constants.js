// constants.js
const VIP_COST = {
  1: 2000,
  2: 4000,
  3: 6000,
  4: 8000,
  5: 10000,
  6: 20000,
  7: 40000,
  8: 60000,
  9: 80000,
  10: 100000,
};

const WITHDRAWAL_FEE = 300;
const MIN_WITHDRAWAL_AMOUNT = 1300;

// Define VIP commission rates per level
// This array represents the commission earned *when a referred user reaches that specific VIP level*.
// The index corresponds to the VIP level minus one (e.g., index 0 for VIP 1, index 1 for VIP 2, etc.)
// Adjust these values based on your actual business logic.
const COMMISSION_RATES_PER_LEVEL = [
    1000, // Commission for VIP 1
    1000, // Commission for VIP 2
    1500, // Commission for VIP 3
    2000, // Commission for VIP 4
    2500, // Commission for VIP 5
    5000, // Commission for VIP 6
    10000, // Commission for VIP 7
    15000, // Commission for VIP 8
    20000, // Commission for VIP 9
    25000  // Commission for VIP 10
];


module.exports = {
  VIP_COST,
  WITHDRAWAL_FEE,
  MIN_WITHDRAWAL_AMOUNT,
  COMMISSION_RATES_PER_LEVEL, // Export the new constant
};
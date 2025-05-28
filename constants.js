// constants.js

// Renamed from VIP_COST to GOLD_COST
const GOLD_COST = {
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
const MIN_WITHDRAWAL_AMOUNT = 1000;

// This array now represents the fixed commission *payout amounts*
// for each Gold Level purchase, assuming the referrer is eligible.
// The index corresponds to the Gold level minus one.
const GOLD_COMMISSION_PAYOUTS = [
    1000, // For Gold 1 (50% of 2000)
    1000, // For Gold 2 (25% of 4000)
    1500, // For Gold 3 (25% of 6000)
    2000, // For Gold 4 (25% of 8000)
    2500, // For Gold 5 (25% of 10000)
    5000, // For Gold 6 (25% of 20000)
    10000, // For Gold 7 (25% of 40000)
    15000, // For Gold 8 (25% of 60000)
    20000, // For Gold 9 (25% of 80000)
    25000  // For Gold 10 (25% of 100000)
];

// Add the support bot username here
const SUPPORT_BOT_USERNAME = 'KGF_Help_bot'; // Your help bot's username

module.exports = {
  GOLD_COST,
  WITHDRAWAL_FEE,
  MIN_WITHDRAWAL_AMOUNT,
  GOLD_COMMISSION_PAYOUTS,
  SUPPORT_BOT_USERNAME, // Export it
};

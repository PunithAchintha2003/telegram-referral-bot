// utils/commission.js
const User = require('../models/User');
const { VIP_COST, COMMISSION_RATES_PER_LEVEL } = require('../constants'); // Import COMMISSION_RATES_PER_LEVEL

/**
 * Calculates and pays commission to a referrer for a VIP purchase/upgrade.
 * Notifies the referrer via Telegram.
 *
 * @param {string} referrerReferralCode - The referral code of the user who referred the purchasing user.
 * @param {number} targetVIP - The VIP level the user just upgraded to.
 * @param {object} bot - The Telegram bot instance to send notifications.
 * @param {object} purchasingUser - The User Mongoose document of the user who just made the VIP purchase.
 */
async function payCommission(referrerReferralCode, targetVIP, bot, purchasingUser) {
  if (!referrerReferralCode) {
    return; // No referrer, no commission
  }

  const referrer = await User.findOne({ referralCode: referrerReferralCode });
  if (!referrer) {
    console.error(`Referrer with referral code ${referrerReferralCode} not found.`);
    return; // Referrer doesn't exist, cannot pay commission
  }

  // If the referrer has not reached VIP 1, they are not eligible for any commission.
  if (referrer.vipLevel < 1) {
    console.log(`ℹ️ Referrer ${referrer.fullName || referrer.username || referrer.telegramId} (VIP: ${referrer.vipLevel}) is not VIP 1. No commission paid for ${purchasingUser.fullName}'s VIP Level ${targetVIP} purchase.`);
    return;
  }

  let commission = 0;

  // Rule: If referrer's VIP Level >= purchased VIP Level, get the full amount from COMMISSION_RATES_PER_LEVEL
  if (referrer.vipLevel >= targetVIP) {
    commission = COMMISSION_RATES_PER_LEVEL[targetVIP - 1]; // Use the pre-calculated value from constants
  }
  // Rule: If referrer's VIP Level < purchased VIP Level, but referrer is VIP 1+, they get LKR 1000 (VIP 1 commission)
  else if (referrer.vipLevel < targetVIP && referrer.vipLevel >= 1) {
    commission = COMMISSION_RATES_PER_LEVEL[0]; // Always LKR 1000, which is the VIP 1 commission
  }

  if (commission > 0) {
    referrer.balance += commission;
    await referrer.save();

    console.log(`✅ Commission paid: ${commission.toFixed(2)} LKR to ${referrer.fullName || referrer.username} (Ref: ${referrer.referralCode}) for ${purchasingUser.fullName || purchasingUser.username}'s VIP Level ${targetVIP} purchase.`);

    // Notify the referrer via Telegram
    try {
      if (referrer.telegramId) {
        await bot.sendMessage(
          referrer.telegramId.toString(),
          `💰 You earned ${commission.toFixed(2)} LKR commission from ${purchasingUser.fullName || purchasingUser.username}'s VIP Level ${targetVIP} purchase! Your new balance is LKR ${referrer.balance.toFixed(2)}.`
        );
      }
    } catch (e) {
      console.error(`❌ Failed to notify referrer ${referrer.telegramId} about commission:`, e.message);
    }
  } else {
    // This else block handles cases where commission is 0 (e.g., if referrer VIP < 1, or other edge cases)
    console.log(`ℹ️ No commission paid to ${referrer.fullName || referrer.username} for ${purchasingUser.fullName || purchasingUser.username}'s VIP Level ${targetVIP} purchase. (Referrer VIP: ${referrer.vipLevel} vs Target VIP: ${targetVIP})`);
  }
}

module.exports = { payCommission };
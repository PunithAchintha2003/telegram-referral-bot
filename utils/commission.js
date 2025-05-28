// utils/commission.js

const User = require('../models/User');
const { GOLD_COMMISSION_PAYOUTS, GOLD_COST } = require('../constants'); // Import GOLD_COST as well for calculation

async function payCommission(referredByCode, purchasedLevel, bot, referredUser) {
    try {
        const referrer = await User.findOne({ referralCode: referredByCode });

        if (!referrer) {
            console.warn(`Commission: Referrer with code ${referredByCode} not found.`);
            return { success: false, message: "Referrer not found." };
        }

        const referrerVipLevel = referrer.vipLevel;

        // Ensure the purchased level is within valid range for GOLD_COMMISSION_PAYOUTS
        if (purchasedLevel < 1 || purchasedLevel > GOLD_COMMISSION_PAYOUTS.length) {
            console.warn(`Commission: Invalid purchasedLevel ${purchasedLevel}. No commission awarded.`);
            return { success: false, message: "Invalid purchased level for commission calculation." };
        }

        // Get the potential commission amount for the purchased level
        // This is the commission *if* the referrer was at or above this level.
        const potentialCommissionAmount = GOLD_COMMISSION_PAYOUTS[purchasedLevel - 1];

        // Determine the maximum commission the referrer can earn based on THEIR OWN VIP level.
        // If referrer's VIP level is N, they can earn the commission amount associated with VIP level N.
        let maxReferrerEligibleCommission = 0;
        if (referrerVipLevel > 0 && referrerVipLevel <= GOLD_COMMISSION_PAYOUTS.length) {
             maxReferrerEligibleCommission = GOLD_COMMISSION_PAYOUTS[referrerVipLevel - 1];
        } else {
            // If referrer has VIP level 0 or an invalid level, they cannot earn commission.
            console.log(`Commission: Referrer ${referrer.telegramId} has VIP level ${referrerVipLevel}. Cannot earn commission.`);
            return { success: false, message: "Referrer not eligible for commission based on VIP level." };
        }

        // The actual commission earned is the minimum of:
        // 1. The commission amount for the *referred user's purchased level*
        // 2. The maximum commission the *referrer is eligible for based on their own VIP level*
        const earnedCommission = Math.min(potentialCommissionAmount, maxReferrerEligibleCommission);

        if (earnedCommission > 0) {
            referrer.balance += earnedCommission;
            referrer.commissionEarned = (referrer.commissionEarned || 0) + earnedCommission; // Ensure commissionEarned is initialized
            await referrer.save();

            // Notify referrer
            if (bot && referrer.telegramId) {
                const referredUserName = referredUser.fullName || referredUser.username || `User ID: ${referredUser.telegramId}`;
                await bot.sendMessage(referrer.telegramId,
                    `💰 You earned LKR ${earnedCommission.toFixed(2)} commission! ` +
                    `Your referred user ${referredUserName} purchased VIP Level ${purchasedLevel}.`
                );
            }
            console.log(`Commission awarded: LKR ${earnedCommission.toFixed(2)} to ${referrer.telegramId} from ${referredUser.telegramId}'s VIP ${purchasedLevel} purchase.`);
            return { success: true, message: "Commission paid successfully.", amount: earnedCommission };
        } else {
            console.log(`Commission: Earned commission was 0 or less for referrer ${referrer.telegramId} from user ${referredUser.telegramId} (purchased level ${purchasedLevel}).`);
            return { success: false, message: "No eligible commission amount or referrer's VIP level too low." };
        }

    } catch (error) {
        console.error("Error in payCommission:", error);
        return { success: false, message: "Internal server error during commission payment." };
    }
}

module.exports = {
    payCommission,
};

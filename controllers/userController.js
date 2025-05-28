// controllers/userController.js

const User = require('../models/User');
const crypto = require('crypto');
const { payCommission } = require('../utils/commission');
const { GOLD_COST, MIN_WITHDRAWAL_AMOUNT, WITHDRAWAL_FEE } = require('../constants');

// The import for getGoldCost is removed as GOLD_COST is directly available from constants.

function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex');
}

exports.registerUser = async (telegramId, username, referredBy = null) => {
  try {
    if (!telegramId) throw new Error('telegramId is required');

    let user = await User.findOne({ telegramId: telegramId.toString() });
    if (user) return { success: false, message: 'User already registered', user };

    let referralCode = generateReferralCode();
    while (await User.findOne({ referralCode })) {
      referralCode = generateReferralCode();
    }

    user = new User({
      telegramId: telegramId.toString(),
      username: username || null,
      referralCode,
      referredBy,
      isVerified: false,
      vipLevel: 0,
      balance: 0,
      upgradeHistory: [], // Ensure this is initialized for new users
      withdrawals: [], // Ensure this is initialized for new users
      commissionEarned: 0 // Initialize this field for new users
    });

    await user.save();
    return { success: true, message: 'User registered successfully', user };
  } catch (err) {
    console.error('registerUser error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

exports.verifyUser = async (telegramId, fullName = null, username = null) => {
  try {
    if (!telegramId) throw new Error('telegramId is required');

    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found' };

    user.isVerified = true;
    if (fullName) user.fullName = fullName;
    if (username) user.username = username;

    await user.save();
    return { success: true, message: 'User verified successfully', user };
  } catch (err) {
    console.error('verifyUser error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

exports.goldPurchaseRequest = async (telegramId, requestedGoldLevel, paymentSlipFileId) => {
  try {
    if (!telegramId || !requestedGoldLevel || !paymentSlipFileId) {
      throw new Error('telegramId, requestedGoldLevel, and paymentSlipFileId required');
    }

    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found' };

    // Check if the requested level is exactly one level higher than current VIP level
    if (requestedGoldLevel !== user.vipLevel + 1) {
      return { success: false, message: `To acquire VIP Level ${requestedGoldLevel}, you must first acquire VIP Level ${user.vipLevel + 1}.` };
    }

    if (requestedGoldLevel <= user.vipLevel) {
      return { success: false, message: 'Requested Gold Level must be higher than your current VIP Level' };
    }

    // Ensure the requested level is a valid key in GOLD_COST
    if (!GOLD_COST.hasOwnProperty(requestedGoldLevel)) {
        return { success: false, message: 'Invalid Gold Level requested.' };
    }

    user.paymentSlip = {
      fileId: paymentSlipFileId,
      status: 'pending',
      uploadedAt: new Date(),
    };
    user.requestedGoldLevel = requestedGoldLevel;

    await user.save();
    return { success: true, message: 'Gold purchase request submitted, awaiting admin approval', user };
  } catch (err) {
    console.error('goldPurchaseRequest error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

exports.requestWithdrawal = async (telegramId, amount) => {
  try {
    if (!telegramId || !amount) throw new Error('telegramId and amount required');

    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found' };

    if (!user.paymentDetails || !user.paymentDetails.accountNumber) {
        return { success: false, message: 'Please add your bank account details first using the "Add Withdrawal Details" button.' };
    }

    if (amount < MIN_WITHDRAWAL_AMOUNT) {
      return { success: false, message: `Minimum withdrawal amount is LKR ${MIN_WITHDRAWAL_AMOUNT}` };
    }

    const totalDeduction = amount + WITHDRAWAL_FEE;
    if (user.balance < totalDeduction) {
      return { success: false, message: `Insufficient balance. You need LKR ${totalDeduction} (LKR ${amount} + LKR ${WITHDRAWAL_FEE} fee). Your current balance is LKR ${user.balance.toFixed(2)}` };
    }

    user.balance -= totalDeduction;

    user.withdrawals.push({
      amount,
      fee: WITHDRAWAL_FEE,
      status: 'pending',
      requestedAt: new Date(),
    });

    await user.save();
    return { success: true, message: 'Withdrawal request submitted, awaiting admin approval', user };
  } catch (err) {
    console.error('requestWithdrawal error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

// Admin approves or rejects Gold purchase slip and grants VIP Level
exports.adminGoldApprove = async (userId, approve, bot) => { // userId is MongoDB _id
  try {
    const user = await User.findById(userId);

    if (!user) return { success: false, message: 'User not found' };

    if (!user.paymentSlip || user.paymentSlip.status !== 'pending') {
      return { success: false, message: 'No pending Gold purchase slip found' };
    }

    const newVIPLevel = user.requestedGoldLevel;
    const purchaseCost = GOLD_COST[newVIPLevel]; // Get the cost for upgrade history

    if (approve) {
      if (!newVIPLevel || !purchaseCost) {
          return { success: false, message: 'Requested Gold Level or its cost missing for approval.' };
      }

      // Check if user is trying to skip levels through slip approval
      if (newVIPLevel !== user.vipLevel + 1) {
          return { success: false, message: `Invalid approval: User is trying to skip VIP levels via slip. Current: ${user.vipLevel}, Requested: ${newVIPLevel}.` };
      }

      user.vipLevel = newVIPLevel;
      user.paymentSlip.status = 'approved';
      user.paymentSlip.fileId = null;
      user.requestedGoldLevel = null;
      // REMOVED: user.balance += purchaseCost; // This line is removed as per your requirement.
                                            // User's balance should not increase from VIP purchase itself.


      // Ensure upgradeHistory is an array before pushing
      if (!user.upgradeHistory) {
          user.upgradeHistory = [];
      }
      // PUSH TO upgradeHistory
      user.upgradeHistory.push({
          level: newVIPLevel,
          cost: purchaseCost, // Record the cost of the gold level purchase
          approvedAt: new Date(),
          method: 'Gold Purchase (Slip)'
      });

      // --- Commission Distribution Logic (Delegated to payCommission) ---
      if (user.referredBy) {
        await payCommission(user.referredBy, newVIPLevel, bot, user); // Pass 'user' object as referredUser
      }

    } else { // Reject
      user.paymentSlip.status = 'rejected';
      user.paymentSlip.fileId = null;
      user.requestedGoldLevel = null;
    }

    await user.save();
    return { success: true, message: `Gold purchase slip ${approve ? 'approved' : 'rejected'}`, user };
  } catch (err) {
    console.error('adminGoldApprove error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

exports.adminWithdrawalProcess = async (telegramId, withdrawalId, approve) => {
  try {
    if (!telegramId || !withdrawalId || typeof approve !== 'boolean') {
      throw new Error('telegramId, withdrawalId, and approve (boolean) required');
    }

    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found' };

    const withdrawal = user.withdrawals.id(withdrawalId) || user.withdrawals.find(w => w._id.toString() === withdrawalId);

    if (!withdrawal) return { success: false, message: 'Withdrawal request not found' };
    if (withdrawal.status !== 'pending') return { success: false, message: 'Withdrawal request already processed' };

    if (approve) {
      withdrawal.status = 'approved';
      withdrawal.processedAt = new Date();
    } else { // Reject
      withdrawal.status = 'rejected';
      withdrawal.processedAt = new Date();

      // Only refund if rejected
      user.balance += (withdrawal.amount + withdrawal.fee);
    }

    await user.save();
    return { success: true, message: `Withdrawal request ${approve ? 'approved' : 'rejected'}`, user };
  } catch (err) {
    console.error('adminWithdrawalProcess error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

exports.updatePaymentDetails = async (telegramId, bankName, accountNumber, accountName, branch) => {
  try {
    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found' };

    user.paymentDetails = {
      bankName: bankName || null,
      accountNumber: accountNumber || null,
      accountName: accountName || null,
      branch: branch || null,
    };
    await user.save();
    return { success: true, message: 'Payment details updated successfully', user };
  } catch (err) {
    console.error('updatePaymentDetails error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

exports.requestUpgradeFromBalance = async (telegramId, targetVIP) => {
    try {
        if (!telegramId || !targetVIP) {
            throw new Error('telegramId and targetVIP are required');
        }

        const user = await User.findOne({ telegramId: telegramId.toString() });
        if (!user) return { success: false, message: 'User not found' };

        // Ensure user upgrades level by level
        if (targetVIP !== user.vipLevel + 1) {
            return { success: false, message: `You can only upgrade to VIP Level ${user.vipLevel + 1}.` };
        }

        if (targetVIP <= user.vipLevel) {
            return { success: false, message: 'Requested VIP Level must be higher than your current VIP Level.' };
        }

        const cost = GOLD_COST[targetVIP];
        if (!cost) {
            return { success: false, message: 'Invalid VIP Level requested.' };
        }

        if (user.balance < cost) {
            return { success: false, message: `Insufficient balance. You need LKR ${cost} to upgrade to VIP Level ${targetVIP}. Your current balance is LKR ${user.balance.toFixed(2)}` };
        }

        user.upgradeRequest = {
            targetVIP: targetVIP,
            requestedAt: new Date()
        };

        await user.save();
        return { success: true, message: 'Upgrade request submitted from balance, awaiting admin approval', user };
    } catch (err) {
        console.error('requestUpgradeFromBalance error:', err);
        return { success: false, message: 'Internal server error', error: err.message };
    }
};

exports.adminApproveUpgradeFromBalance = async (userId, approve, bot) => {
    try {
        const user = await User.findById(userId);

        if (!user) return { success: false, message: 'User not found' };

        if (!user.upgradeRequest || !user.upgradeRequest.targetVIP) {
            return { success: false, message: 'No pending upgrade request found for this user.' };
        }

        const targetVIP = user.upgradeRequest.targetVIP;
        const cost = GOLD_COST[targetVIP];

        if (!cost) {
            return { success: false, message: 'Invalid target VIP level in request.' };
        }

        if (approve) {
            // Re-check balance at approval time to prevent issues if balance changed
            if (user.balance < cost) {
                return { success: false, message: `User has insufficient balance (LKR ${user.balance.toFixed(2)}) for VIP Level ${targetVIP} (Cost: LKR ${cost}). Cannot approve.` };
            }

            // Check if user is trying to skip levels through balance approval
            if (targetVIP !== user.vipLevel + 1) {
                return { success: false, message: `Invalid approval: User is trying to skip VIP levels via balance. Current: ${user.vipLevel}, Requested: ${targetVIP}.` };
            }

            user.balance -= cost;
            user.vipLevel = targetVIP;
            user.upgradeRequest = null;

            // Ensure upgradeHistory is an array before pushing
            if (!user.upgradeHistory) {
                user.upgradeHistory = [];
            }
            // PUSH TO upgradeHistory
            user.upgradeHistory.push({
                level: targetVIP,
                cost: cost, // Record the cost of the balance upgrade
                approvedAt: new Date(),
                approvedBy: 'Admin (Balance)'
            });

            // --- Commission Distribution Logic (Delegated to payCommission) ---
            if (user.referredBy) {
                await payCommission(user.referredBy, targetVIP, bot, user); // Pass 'user' object as referredUser
            }

        } else { // Reject
            user.upgradeRequest = null;
            // Optionally, refund the deducted amount if it was deducted at request time (if your flow does that)
            // Based on your current flow, balance deduction happens at approval, so no refund needed here.
        }

        await user.save();
        return { success: true, message: `Upgrade request ${approve ? 'approved' : 'rejected'}.`, user };
    } catch (err) {
        console.error('adminApproveUpgradeFromBalance error:', err);
        return { success: false, message: 'Internal server error', error: err.message };
    }
};

exports.getAllUserStats = async () => {
  try {
    // Select all necessary fields, including upgradeHistory and withdrawals
    const users = await User.find({}).select('fullName username telegramId vipLevel upgradeHistory withdrawals balance commissionEarned'); // Include commissionEarned

    let overallTotalDeposits = 0;
    let overallTotalWithdrawals = 0;
    let overallTotalCommissions = 0; // New: overall total commissions

    const usersWithCalculatedStats = users.map(user => {
      // SAFELY access upgradeHistory and withdrawals, defaulting to empty array if undefined
      const userUpgradeHistory = user.upgradeHistory || [];
      const userWithdrawals = user.withdrawals || [];

      // Calculate total deposited amount based on approved upgrade history
      // Ensure GOLD_COST is accessible and valid
      const userDeposited = userUpgradeHistory.reduce((sum, upgrade) => {
        const cost = GOLD_COST[upgrade.level] || 0;
        return sum + cost;
      }, 0);

      // Calculate total approved withdrawal amount
      const userWithdrawalsApproved = userWithdrawals.reduce((sum, withdrawal) => {
        return sum + (withdrawal.status === 'approved' ? withdrawal.amount : 0);
      }, 0);

      // Total commission earned by this specific user
      const userTotalCommissionEarned = user.commissionEarned || 0;


      overallTotalDeposits += userDeposited;
      overallTotalWithdrawals += userWithdrawalsApproved;
      overallTotalCommissions += userTotalCommissionEarned; // Accumulate for overall total

      // Return user object with calculated fields
      return {
        _id: user._id,
        telegramId: user.telegramId,
        username: user.username,
        fullName: user.fullName,
        vipLevel: user.vipLevel,
        totalDeposited: userDeposited,
        totalApprovedWithdrawals: userWithdrawalsApproved,
        currentBalance: user.balance, // Include current balance
        totalCommissionEarned: userTotalCommissionEarned // Include total commission earned by user
      };
    });

    return {
      success: true,
      users: usersWithCalculatedStats, // Return the calculated user data
      totalDeposits: overallTotalDeposits,
      totalWithdrawals: overallTotalWithdrawals,
      totalCommissions: overallTotalCommissions // Return overall total commissions
    };

  } catch (err) {
    console.error('getAllUserStats error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

exports.getUserDetails = async (telegramId) => {
  try {
    // Include all necessary fields for display
    const user = await User.findOne({ telegramId: telegramId.toString() }).select('-paymentSlip'); // Exclude sensitive/large fields if not needed
    if (!user) return { success: false, message: 'User not found' };
    return { success: true, user };
  } catch (err) {
    console.error('getUserDetails error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

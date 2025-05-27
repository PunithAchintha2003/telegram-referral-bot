const User = require('../models/User');
const crypto = require('crypto');
const { payCommission } = require('../utils/commission');
const { getVipCost } = require('../utils/pricing');

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
    });

    await user.save();
    return { success: true, message: 'User registered successfully', user };
  } catch (err) {
    console.error('registerUser error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

// Verify user (MODIFIED)
exports.verifyUser = async (telegramId, fullName = null, username = null) => { // fullName is now optional
  try {
    if (!telegramId) throw new Error('telegramId is required');

    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found' };

    user.isVerified = true;
    if (fullName) user.fullName = fullName; // Only update if fullName is provided
    if (username) user.username = username;

    await user.save();
    return { success: true, message: 'User verified successfully', user };
  } catch (err) {
    console.error('verifyUser error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

// Request VIP purchase by uploading payment slip
exports.vipRequest = async (telegramId, requestedVipLevel, paymentSlipFileId) => {
  try {
    if (!telegramId || !requestedVipLevel || !paymentSlipFileId) {
      throw new Error('telegramId, requestedVipLevel, and paymentSlipFileId required');
    }

    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found' };

    // Condition: User can only buy vip 2 after vip 1, vip 3 after vip 2, etc.
    if (requestedVipLevel !== user.vipLevel + 1) {
      return { success: false, message: `You can only buy VIP Level ${user.vipLevel + 1} next.` };
    }

    if (requestedVipLevel <= user.vipLevel) {
      return { success: false, message: 'Requested VIP level must be higher than current' };
    }

    // Save slip info and requested VIP level, set slip status to pending
    user.paymentSlip = {
      fileId: paymentSlipFileId,
      status: 'pending',
      uploadedAt: new Date(),
    };
    user.requestedVipLevel = requestedVipLevel;

    await user.save();
    return { success: true, message: 'VIP request submitted, awaiting admin approval', user };
  } catch (err) {
    console.error('vipRequest error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

// Request withdrawal
exports.requestWithdrawal = async (telegramId, amount) => {
  const { MIN_WITHDRAWAL_AMOUNT, WITHDRAWAL_FEE } = require('../constants'); // Import constants

  try {
    if (!telegramId || !amount) throw new Error('telegramId and amount required');

    const user = await User.findOne({ telegramId: telegramId.toString() });
    if (!user) return { success: false, message: 'User not found' };

    // Check if payment details are set
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

    // Add withdrawal request
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

// Admin approves or rejects VIP purchase slip
// NOTE: This function is now directly called by adminCommands.js, no longer an API endpoint in the same way.
// It requires the 'bot' instance to notify the referrer.
exports.adminVipApprove = async (userId, approve, bot) => { // userId is MongoDB _id
  try {
    const user = await User.findById(userId);

    if (!user) return { success: false, message: 'User not found' };

    if (!user.paymentSlip || user.paymentSlip.status !== 'pending') {
      return { success: false, message: 'No pending VIP payment slip found' };
    }

    if (approve) {
      const newVipLevel = user.requestedVipLevel;

      if (!newVipLevel) {
          return { success: false, message: 'Requested VIP level missing for approval.' };
      }

      user.vipLevel = newVipLevel;
      user.paymentSlip.status = 'approved';
      user.paymentSlip.fileId = null; // Clear fileId after processing to save space/privacy
      user.requestedVipLevel = null;

      // Add to upgrade history
      user.upgradeHistory.push({
          level: newVipLevel,
          approvedAt: new Date(),
          approvedBy: 'Admin (Slip)' // Can be expanded to actual admin username/id
      });

      // --- Commission Distribution Logic ---
      if (user.referredBy) {
        // Pass the bot instance to payCommission
        await payCommission(user.referredBy, newVipLevel, bot, user);
      }

    } else { // Reject
      user.paymentSlip.status = 'rejected';
      user.paymentSlip.fileId = null; // Clear fileId
      user.requestedVipLevel = null; // Clear requested level on rejection
    }

    await user.save();
    return { success: true, message: `VIP payment slip ${approve ? 'approved' : 'rejected'}`, user };
  } catch (err) {
    console.error('adminVipApprove error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

// Admin processes withdrawal requests
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
      // Actual money sending logic should be implemented separately outside the bot
    } else {
      withdrawal.status = 'rejected';
      withdrawal.processedAt = new Date();

      // Refund amount + fee to user balance on rejection
      user.balance += (withdrawal.amount + withdrawal.fee);
    }

    await user.save();
    return { success: true, message: `Withdrawal request ${approve ? 'approved' : 'rejected'}`, user };
  } catch (err) {
    console.error('adminWithdrawalProcess error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};

// Update user's payment details
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

// Request VIP upgrade using account balance
exports.requestUpgradeFromBalance = async (telegramId, targetVIP) => {
    try {
        const user = await User.findOne({ telegramId: telegramId.toString() });
        if (!user) return { success: false, message: 'User not found' };

        // Condition: User can only buy vip 2 after vip 1, vip 3 after vip 2, etc.
        if (targetVIP !== user.vipLevel + 1) {
          return { success: false, message: `You can only buy VIP Level ${user.vipLevel + 1} next.` };
        }

        if (targetVIP <= user.vipLevel) {
            return { success: false, message: 'Requested VIP level must be higher than current.' };
        }

        const vipCost = getVipCost(targetVIP);
        if (user.balance < vipCost) {
            return { success: false, message: `Insufficient balance. You need LKR ${vipCost}. Your current balance is LKR ${user.balance.toFixed(2)}.` };
        }

        // Store the upgrade request
        user.upgradeRequest = {
            targetVIP: targetVIP,
            requestedAt: new Date()
        };

        await user.save();
        return { success: true, message: 'Upgrade request submitted, awaiting admin approval.', user };
    } catch (err) {
        console.error('requestUpgradeFromBalance error:', err);
        return { success: false, message: 'Internal server error', error: err.message };
    }
};

// Admin approves VIP upgrade from balance
exports.adminApproveUpgradeFromBalance = async (userId, approve, bot) => { // userId is MongoDB _id
    try {
        const user = await User.findById(userId);
        if (!user) return { success: false, message: 'User not found' };
        if (!user.upgradeRequest) return { success: false, message: 'No pending upgrade request for this user.' };

        const targetVIP = user.upgradeRequest.targetVIP;
        const vipCost = getVipCost(targetVIP);

        if (approve) {
            if (user.balance < vipCost) {
                return { success: false, message: `User @${user.username || user.fullName} does not have enough balance. Required: LKR ${vipCost}. Current: LKR ${user.balance.toFixed(2)}.` };
            }

            user.balance -= vipCost;
            user.vipLevel = targetVIP;
            user.upgradeRequest = null; // Clear the request

            // Add to upgrade history
            user.upgradeHistory.push({
                level: targetVIP,
                approvedAt: new Date(),
                approvedBy: 'Admin (Balance)' // Can be expanded to actual admin username/id
            });

            // Commission Distribution Logic
            if (user.referredBy) {
                await payCommission(user.referredBy, targetVIP, bot, user);
            }

        } else { // Deny
            user.upgradeRequest = null; // Clear the request
        }

        await user.save();
        return { success: true, message: `Upgrade request ${approve ? 'approved' : 'denied'}`, user };
    } catch (err) {
        console.error('adminApproveUpgradeFromBalance error:', err);
        return { success: false, message: 'Internal server error', error: err.message };
    }
};


// Get user details by telegramId
exports.getUserDetails = async (telegramId) => { // Modified to be callable internally
  try {
    const user = await User.findOne({ telegramId: telegramId.toString() }).select('-withdrawals -paymentSlip');
    if (!user) return { success: false, message: 'User not found' };
    return { success: true, user };
  } catch (err) {
    console.error('getUserDetails error:', err);
    return { success: false, message: 'Internal server error', error: err.message };
  }
};
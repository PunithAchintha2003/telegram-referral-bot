// models/User.js

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String, default: null, sparse: true },
  fullName: { type: String, default: null },

  // Referral system
  // Added index: true for performance on queries involving referralCode
  referralCode: { type: String, required: true, unique: true, index: true },
  // Added index: true for performance on queries involving referredBy (e.g., finding all referred users)
  referredBy: { type: String, default: null, index: true },

  isVerified: { type: Boolean, default: false },

  // VIP membership and balance
  vipLevel: { type: Number, default: 0 },                       // Current VIP level (0 means no VIP)
  requestedGoldLevel: { type: Number, default: null },           // Gold level user wants to purchase (pending approval via slip)
  balance: { type: Number, default: 0 },                        // User's balance (commissions, etc.)
  commissionEarned: { type: Number, default: 0 },              // Total commission earned by the user

  // Request to buy VIP using account balance
  upgradeRequest: {
    targetVIP: { type: Number, default: null },
    requestedAt: { type: Date, default: null }
    // Consider adding index: true to 'upgradeRequest.targetVIP' if you frequently query for pending upgrades
  },

  // Payment slip upload for Gold purchase approval
  paymentSlip: {
    fileId: { type: String, default: null },                    // Telegram file ID of uploaded slip photo
    status: { type: String, enum: ['pending', 'approved', 'rejected', null], default: null },
    uploadedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null } // Added to track when the slip was processed by admin
    // Consider adding index: true to 'paymentSlip.status' if you frequently query for pending slips
  },

  // Withdrawal requests log
  withdrawals: {
    type: [{
      amount: { type: Number, required: true },
      fee: { type: Number, required: true },
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      requestedAt: { type: Date, default: Date.now },
      processedAt: { type: Date, default: null }
    }],
    default: []
    // You could potentially add indexes to sub-fields like 'withdrawals.status'
    // but for embedded arrays, Mongoose creates compound indexes which can be complex.
    // For simple status checks, a filter on the array might be sufficient.
  },

  // Upgrade history for VIP levels (whether by Gold purchase or balance)
  upgradeHistory: {
    type: [
      {
        level: { type: Number },
        cost: { type: Number }, // Added cost field here for tracking deposit amount
        approvedAt: { type: Date },
        approvedBy: { type: String }
      }
    ],
    default: []
  },

  // User's bank/payment info for withdrawals
  paymentDetails: {
    bankName: { type: String, default: null },
    accountNumber: { type: String, default: null },
    accountName: { type: String, default: null },
    branch: { type: String, default: null }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
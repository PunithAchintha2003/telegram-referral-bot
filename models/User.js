const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true }, // Changed to String for consistency
  username: { type: String, default: null, sparse: true },   // Added for easier lookup by admin
  fullName: { type: String, default: null },                 // User's full name entered at registration

  // Referral system
  referralCode: { type: String, required: true, unique: true }, // Unique referral code for this user
  referredBy: { type: String, default: null },                  // Referral code of the user who referred this user

  isVerified: { type: Boolean, default: false },                // True if user joined channel and completed registration

  // VIP membership and balance
  vipLevel: { type: Number, default: 0 },                       // Current VIP level (0 means no VIP)
  requestedVipLevel: { type: Number, default: null },           // VIP level user wants to purchase (pending approval via slip)
  balance: { type: Number, default: 0 },                        // User's balance (commissions, etc.)

  // Request to buy VIP using account balance
  upgradeRequest: {
    targetVIP: { type: Number, default: null },
    requestedAt: { type: Date, default: null }
  },

  // Payment slip upload for VIP purchase approval
  paymentSlip: {
    fileId: { type: String, default: null },                    // Telegram file ID of uploaded slip photo
    status: { type: String, enum: ['pending', 'approved', 'rejected', null], default: null },
    uploadedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null }
  },

  // Withdrawal requests log
  withdrawals: {
    type: [{
      amount: { type: Number, required: true },                 // Requested amount to withdraw
      fee: { type: Number, required: true },                    // Withdrawal fee
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      requestedAt: { type: Date, default: Date.now },
      processedAt: { type: Date, default: null }
    }],
    default: []
  },
  upgradeHistory: [
    {
      level: Number,
      approvedAt: Date,
      approvedBy: String // admin username or telegramId
    }
  ],

  // User's bank/payment info for withdrawals
  paymentDetails: {
    bankName: { type: String, default: null },
    accountNumber: { type: String, default: null },
    accountName: { type: String, default: null },
    branch: { type: String, default: null }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
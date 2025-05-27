// commands/adminCommands.js

const User = require('../models/User');
const userController = require('../controllers/userController'); // Import userController
const { getVipCost } = require('../utils/pricing'); // Import getVipCost from utils

// IMPORTANT: Define adminIds here as the single source of truth for admin users.
// These are the Telegram user IDs of your administrators.
// Make sure these are NUMBERS.
const adminIds = [
  parseInt(process.env.YOUR_TELEGRAM_ADMIN_ID_1), // Replace with your actual admin Telegram ID
  // Add more admin IDs as needed
];

// Helper function to check if a user is an admin
function isAdmin(userId) {
  return adminIds.includes(userId);
}

// IMPORTANT: This function will be called from index.js
// It takes the bot instance.
function registerAdminCommands(bot) {
  // --- Admin Help Command ---
  bot.onText(/\/admin/, (msg) => {
    if (!isAdmin(msg.from.id)) {
      return bot.sendMessage(msg.chat.id, "❌ You are not authorized to use this command.");
    }

    const commands = `
🛠️ Admin Commands:
/listslips – View pending VIP payment slip uploads for approval.
/withdrawals – View pending withdrawal requests.
/adminapprovewithdraw_MONGO_ID – Approve a withdrawal.
/adminrejectwithdraw_MONGO_ID – Reject a withdrawal.
/pendingupgrades – List all pending VIP upgrade requests (from account balance).
/approveupgrade_MONGO_ID – Approve a VIP upgrade request from balance.
/denyupgrade_MONGO_ID – Deny a VIP upgrade request from balance.
    `;
    bot.sendMessage(msg.chat.id, commands);
  });

  // --- Admin: /listslips Command to view pending slips ---
  bot.onText(/\/listslips/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      return bot.sendMessage(chatId, "❌ You are not authorized to use this command.");
    }

    try {
      const usersWithPendingSlips = await User.find({ 'paymentSlip.status': 'pending' });
      if (usersWithPendingSlips.length === 0) {
        return bot.sendMessage(chatId, "📭 No pending payment slips found at this time.");
      }

      for (const user of usersWithPendingSlips) {
        const caption = `🧑 User: ${user.fullName || user.username || user.telegramId}
🎯 VIP Requested: ${user.requestedVipLevel || 'N/A'}
🕒 Uploaded At: ${user.paymentSlip.uploadedAt.toLocaleString()}
MongoDB ID: ${user._id}`; // Include MongoDB ID for direct reference

        const fileId = user.paymentSlip.fileId;

        await bot.sendPhoto(chatId, fileId, {
          caption,
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Approve", callback_data: `approveSlip_${user._id}` },
              { text: "❌ Reject", callback_data: `rejectSlip_${user._id}` }
            ]]
          }
        });
      }
    } catch (error) {
      console.error("Error fetching pending slips:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred while fetching pending slips.");
    }
  });

  // --- Handle inline keyboard callbacks for slip approval/rejection ---
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const adminId = callbackQuery.from.id;

    if (!isAdmin(adminId)) {
      return bot.answerCallbackQuery(callbackQuery.id, { text: "❌ You are not authorized." });
    }

    const matchApproveSlip = data.match(/^approveSlip_(.+)$/);
    const matchRejectSlip = data.match(/^rejectSlip_(.+)$/);
    const matchApproveUpgrade = data.match(/^approveUpgrade_(.+)$/);
    const matchDenyUpgrade = data.match(/^denyUpgrade_(.+)$/);
    const matchApproveWithdrawal = data.match(/^approveWithdrawal_(.+?)_(.+)$/); // Format: approveWithdrawal_USER_ID_WITHDRAWAL_ID
    const matchRejectWithdrawal = data.match(/^rejectWithdrawal_(.+?)_(.+)$/);   // Format: rejectWithdrawal_USER_ID_WITHDRAWAL_ID


    if (matchApproveSlip) {
      const userId = matchApproveSlip[1]; // This is the MongoDB _id
      const result = await userController.adminVipApprove(userId, true, bot); // Pass bot instance
      if (result.success) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: "✅ VIP purchase approved!" });
        const user = result.user; // Get the updated user object
        if (user && user.telegramId) {
            await bot.sendMessage(user.telegramId.toString(), `🎉 Your VIP Level ${user.vipLevel} has been approved! Welcome to the VIP club!`);
        }
        await bot.editMessageCaption(callbackQuery.message.caption + `\n\nStatus: ✅ Approved by ${callbackQuery.from.first_name}`, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          reply_markup: { inline_keyboard: [] } // Remove buttons
        });
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Approval failed: ${result.message}` });
      }
    }

    if (matchRejectSlip) {
      const userId = matchRejectSlip[1];
      const result = await userController.adminVipApprove(userId, false, bot); // Pass bot instance
      if (result.success) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ VIP purchase rejected." });
        const user = result.user;
        if (user && user.telegramId) {
            await bot.sendMessage(user.telegramId.toString(), "❌ Your VIP purchase request was rejected. Please review your payment slip and try again, or contact support.");
        }
        await bot.editMessageCaption(callbackQuery.message.caption + `\n\nStatus: ❌ Rejected by ${callbackQuery.from.first_name}`, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          reply_markup: { inline_keyboard: [] } // Remove buttons
        });
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Rejection failed: ${result.message}` });
      }
    }

    // Handle Upgrade (from balance) approvals/denials
    if (matchApproveUpgrade) {
        const userId = matchApproveUpgrade[1];
        const result = await userController.adminApproveUpgradeFromBalance(userId, true, bot);
        if (result.success) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: "✅ Upgrade approved!" });
            const user = result.user;
            if (user && user.telegramId) {
                await bot.sendMessage(user.telegramId.toString(), `🎉 Your VIP Level ${user.vipLevel} upgrade using account balance has been approved!`);
            }
            await bot.editMessageText(callbackQuery.message.text + `\n\nStatus: ✅ Approved by ${callbackQuery.from.first_name}`, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                reply_markup: { inline_keyboard: [] }
            });
        } else {
            await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Approval failed: ${result.message}` });
        }
    }

    if (matchDenyUpgrade) {
        const userId = matchDenyUpgrade[1];
        const result = await userController.adminApproveUpgradeFromBalance(userId, false, bot);
        if (result.success) {
            await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Upgrade denied." });
            const user = result.user;
            if (user && user.telegramId) {
                await bot.sendMessage(user.telegramId.toString(), `❌ Your VIP upgrade request has been denied by an admin. Please contact support.`);
            }
            await bot.editMessageText(callbackQuery.message.text + `\n\nStatus: ❌ Denied by ${callbackQuery.from.first_name}`, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                reply_markup: { inline_keyboard: [] }
            });
        } else {
            await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Denial failed: ${result.message}` });
        }
    }

    // Handle Withdrawal approvals/rejections
    if (matchApproveWithdrawal) {
      const mongoUserId = matchApproveWithdrawal[1];
      const withdrawalId = matchApproveWithdrawal[2];
      const user = await User.findById(mongoUserId); // Find user by MongoDB _id

      if (!user) return bot.answerCallbackQuery(callbackQuery.id, { text: "❌ User not found." });

      const result = await userController.adminWithdrawalProcess(user.telegramId.toString(), withdrawalId, true);
      if (result.success) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: "✅ Withdrawal approved!" });
        if (user.telegramId) {
            await bot.sendMessage(user.telegramId.toString(), `✅ Your withdrawal request of LKR ${result.user.withdrawals.id(withdrawalId).amount} has been approved!`);
        }
        await bot.editMessageText(callbackQuery.message.text + `\n\nStatus: ✅ Approved by ${callbackQuery.from.first_name}`, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          reply_markup: { inline_keyboard: [] }
        });
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Approval failed: ${result.message}` });
      }
    }

    if (matchRejectWithdrawal) {
      const mongoUserId = matchRejectWithdrawal[1];
      const withdrawalId = matchRejectWithdrawal[2];
      const user = await User.findById(mongoUserId);

      if (!user) return bot.answerCallbackQuery(callbackQuery.id, { text: "❌ User not found." });

      const result = await userController.adminWithdrawalProcess(user.telegramId.toString(), withdrawalId, false);
      if (result.success) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Withdrawal rejected." });
        if (user.telegramId) {
            await bot.sendMessage(user.telegramId.toString(), `❌ Your withdrawal request has been rejected. The amount has been refunded to your balance.`);
        }
        await bot.editMessageText(callbackQuery.message.text + `\n\nStatus: ❌ Rejected by ${callbackQuery.from.first_name}`, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          reply_markup: { inline_keyboard: [] }
        });
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Rejection failed: ${result.message}` });
      }
    }
  });

  // === Admin: /pendingupgrades Command ===
  bot.onText(/\/pendingupgrades/, async (msg) => {
    if (!isAdmin(msg.from.id)) {
      return bot.sendMessage(msg.chat.id, "❌ You are not authorized to use this command.");
    }

    const chatId = msg.chat.id;
    try {
      const pendingUsers = await User.find({ upgradeRequest: { $ne: null } });

      if (pendingUsers.length === 0) {
        return bot.sendMessage(chatId, "✅ No pending VIP upgrade requests at this time.");
      }

      let message = "📋 Pending VIP Upgrades:\n\n";
      for (const user of pendingUsers) {
        const targetVIP = user.upgradeRequest.targetVIP;
        const cost = getVipCost(targetVIP);
        message += `• User: ${user.fullName || user.username || user.telegramId} (ID: ${user._id})
  Requested VIP: ${targetVIP}
  Current Balance: LKR ${user.balance.toFixed(2)} (Cost: LKR ${cost})
  Requested At: ${user.upgradeRequest.requestedAt.toLocaleString()}
  Actions: /approveupgrade_${user._id} /denyupgrade_${user._id}\n\n`; // Use MongoDB _id for direct actions
      }

      bot.sendMessage(chatId, message);
    } catch (error) {
      console.error("Error fetching pending upgrades:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred while fetching pending upgrade requests.");
    }
  });

  // === Admin: /withdrawals Command to view pending withdrawals ===
  bot.onText(/\/withdrawals/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      return bot.sendMessage(chatId, "❌ You are not authorized to use this command.");
    }

    try {
      const usersWithPendingWithdrawals = await User.find({ 'withdrawals.status': 'pending' });

      if (usersWithPendingWithdrawals.length === 0) {
        return bot.sendMessage(chatId, "📭 No pending withdrawal requests found at this time.");
      }

      let message = "💸 Pending Withdrawal Requests:\n\n";
      for (const user of usersWithPendingWithdrawals) {
        const pendingWithdrawals = user.withdrawals.filter(w => w.status === 'pending');
        for (const withdrawal of pendingWithdrawals) {
          message += `🧑 User: ${user.fullName || user.username || user.telegramId} (ID: ${user._id})
  💰 Amount: LKR ${withdrawal.amount.toFixed(2)} (Fee: LKR ${withdrawal.fee.toFixed(2)})
  🏦 Bank: ${user.paymentDetails.bankName || 'N/A'} - ${user.paymentDetails.accountNumber || 'N/A'}
  👤 Acc Name: ${user.paymentDetails.accountName || 'N/A'}
  branch: ${user.paymentDetails.branch || 'N/A'}
  🕒 Requested At: ${withdrawal.requestedAt.toLocaleString()}
  MongoDB Withdrawal ID: ${withdrawal._id}
  Actions: /adminapprovewithdraw_${user._id}_${withdrawal._id} /adminrejectwithdraw_${user._id}_${withdrawal._id}\n\n`;
        }
      }
      bot.sendMessage(chatId, message);
    } catch (error) {
      console.error("Error fetching pending withdrawals:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred while fetching pending withdrawal requests.");
    }
  });

  // --- Admin: /adminapprovewithdraw_USERID_WITHDRAWALID & /adminrejectwithdraw_USERID_WITHDRAWALID ---
  bot.onText(/\/admin(approve|reject)withdraw_(.+?)_(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      return bot.sendMessage(chatId, "❌ You are not authorized to use this command.");
    }

    const action = match[1]; // 'approve' or 'reject'
    const mongoUserId = match[2];
    const withdrawalId = match[3];

    try {
      const user = await User.findById(mongoUserId);
      if (!user) {
        return bot.sendMessage(chatId, "❌ User not found with that MongoDB ID.");
      }

      const result = await userController.adminWithdrawalProcess(user.telegramId.toString(), withdrawalId, action === 'approve');
      if (result.success) {
        await bot.sendMessage(chatId, `✅ Withdrawal for ${user.fullName || user.username || user.telegramId} has been ${action === 'approve' ? 'approved' : 'rejected'}.`);
        if (user.telegramId) {
            if (action === 'approve') {
                await bot.sendMessage(user.telegramId.toString(), `✅ Your withdrawal request of LKR ${result.user.withdrawals.id(withdrawalId).amount} has been approved!`);
            } else {
                await bot.sendMessage(user.telegramId.toString(), `❌ Your withdrawal request has been rejected. The amount has been refunded to your balance.`);
            }
        }
      } else {
        await bot.sendMessage(chatId, `❌ Failed to ${action} withdrawal: ${result.message}`);
      }
    } catch (error) {
      console.error(`Error during admin ${action} withdrawal:`, error);
      bot.sendMessage(chatId, `⚠️ An error occurred while trying to ${action} the withdrawal.`);
    }
  });


  // --- Admin: /approveupgrade_MONGOID & /denyupgrade_MONGOID ---
  bot.onText(/\/approveupgrade_(.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!isAdmin(chatId)) {
          return bot.sendMessage(chatId, "❌ You are not authorized to use this command.");
      }
      const mongoUserId = match[1];
      try {
          const user = await User.findById(mongoUserId);
          if (!user) return bot.sendMessage(chatId, "❌ User not found.");
          const result = await userController.adminApproveUpgradeFromBalance(mongoUserId, true, bot);
          if (result.success) {
              await bot.sendMessage(chatId, `✅ Approved @${user.username || user.fullName}'s upgrade to VIP ${user.vipLevel}.`);
              if (user.telegramId) {
                  await bot.sendMessage(user.telegramId.toString(), `🎉 Your VIP ${user.vipLevel} upgrade using balance has been approved!`);
              }
          } else {
              await bot.sendMessage(chatId, `❌ Failed to approve upgrade: ${result.message}`);
          }
      } catch (error) {
          console.error("Error approving upgrade:", error);
          bot.sendMessage(chatId, "⚠️ An error occurred while approving the upgrade.");
      }
  });

  bot.onText(/\/denyupgrade_(.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (!isAdmin(chatId)) {
          return bot.sendMessage(chatId, "❌ You are not authorized to use this command.");
      }
      const mongoUserId = match[1];
      try {
          const user = await User.findById(mongoUserId);
          if (!user) return bot.sendMessage(chatId, "❌ User not found.");
          const result = await userController.adminApproveUpgradeFromBalance(mongoUserId, false, bot);
          if (result.success) {
              await bot.sendMessage(chatId, `❌ Denied @${user.username || user.fullName}'s upgrade request.`);
              if (user.telegramId) {
                  await bot.sendMessage(user.telegramId.toString(), `❌ Your VIP upgrade request has been denied by an admin.`);
              }
          } else {
              await bot.sendMessage(chatId, `❌ Failed to deny upgrade: ${result.message}`);
          }
      } catch (error) {
          console.error("Error denying upgrade:", error);
          bot.sendMessage(chatId, "⚠️ An error occurred while denying the upgrade.");
      }
  });

}

module.exports = { registerAdminCommands, adminIds };
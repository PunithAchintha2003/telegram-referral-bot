// commands/adminCommands.js

const User = require('../models/User');
const userController = require('../controllers/userController');
const { GOLD_COST } = require('../constants'); // Import GOLD_COST for calculating deposits

// IMPORTANT: This function will be called from index.js
// It takes the bot instance, the adminIds array, AND the adminKeyboard.
function registerAdminCommands(bot, adminIds, adminKeyboard) { // <<< ADD adminKeyboard parameter

  // Helper function to check if a user is an admin
  function isAdmin(userId) {
    return adminIds.includes(userId);
  }

  // Helper function to escape MarkdownV2 special characters
  const escapeMarkdown = (text) => {
    if (typeof text !== 'string') return text; // Handle non-string values gracefully
    return text.replace(/_/g, '\\_')
               .replace(/\*/g, '\\*')
               .replace(/\[/g, '\\[')
               .replace(/\]/g, '\\]')
               .replace(/\(/g, '\\(')
               .replace(/\)/g, '\\)')
               .replace(/~/g, '\\~')
               .replace(/`/g, '\\`')
               .replace(/>/g, '\\>')
               .replace(/#/g, '\\#')
               .replace(/\+/g, '\\+')
               .replace(/-/g, '\\-')
               .replace(/=/g, '\\=')
               .replace(/\|/g, '\\|')
               .replace(/{/g, '\\{')
               .replace(/}/g, '\\}')
               .replace(/\./g, '\\.')
               .replace(/!/g, '\\!');
  };

  // --- Admin Help Command ---
  bot.onText(/\/admin/, (msg) => {
    if (!isAdmin(msg.from.id)) {
      // Send unauthorized message AND ensure user keyboard is removed
      return bot.sendMessage(msg.chat.id, "❌ You are not authorized to use this command.", { reply_markup: { remove_keyboard: true } });
    }

    // Updated command list for admin, reflecting button-based actions
    const commands = `
🛠️ Admin Commands:
/listslips – View pending Gold payment slip uploads for approval.
/pendingupgrades – View pending VIP upgrade requests from user balances.
/withdrawals – View pending withdrawal requests.
/userstats – View summary of all users (VIP, Deposits, Withdrawals).
    `;
    bot.sendMessage(msg.chat.id, commands, adminKeyboard); // <<< SEND ADMIN KEYBOARD
  });

  // --- Admin: /listslips Command to view pending slips ---
  bot.onText(/\/listslips/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      return bot.sendMessage(chatId, "❌ You are not authorized to use this command.", { reply_markup: { remove_keyboard: true } });
    }

    try {
      const usersWithPendingSlips = await User.find({ 'paymentSlip.status': 'pending' });
      if (usersWithPendingSlips.length === 0) {
        // Send message AND ensure admin keyboard is present
        return bot.sendMessage(chatId, "📭 No pending Gold payment slips found at this time.", adminKeyboard); // <<< SEND ADMIN KEYBOARD
      }

      for (const user of usersWithPendingSlips) {
        // Ensure user.paymentSlip and its properties exist before accessing
        const uploadedAt = user.paymentSlip && user.paymentSlip.uploadedAt ? user.paymentSlip.uploadedAt.toLocaleString() : 'N/A';
        const fileId = user.paymentSlip && user.paymentSlip.fileId ? user.paymentSlip.fileId : null;

        if (!fileId) {
            console.warn(`User ${user._id} has pending slip status but no fileId. Skipping photo send.`);
            await bot.sendMessage(chatId, `⚠️ User: ${user.fullName || user.username || user.telegramId} has a pending slip but no file was found. Please check manually.`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: "❌ Reject Gold Purchase (No File)", callback_data: `rejectSlip_${user._id}` }
                    ]]
                },
                ...adminKeyboard // Keep admin keyboard even on error messages
            });
            continue; // Skip to the next user
        }

        const caption = `🧑 User: ${user.fullName || user.username || user.telegramId}
🎯 Gold Level Requested: ${user.requestedGoldLevel || 'N/A'} (Will grant VIP Level ${user.requestedGoldLevel || 'N/A'})
🕒 Uploaded At: ${uploadedAt}
MongoDB ID: ${user._id}`;


        await bot.sendPhoto(chatId, fileId, {
          caption,
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Approve Gold Purchase", callback_data: `approveSlip_${user._id}` },
              { text: "❌ Reject Gold Purchase", callback_data: `rejectSlip_${user._id}` }
            ]]
          }
        });
      }
      // After all slips are sent, explicitly send a confirmation message with the admin keyboard
      await bot.sendMessage(chatId, "Above are all pending Gold payment slips.", adminKeyboard); // <<< Optional: summary + ADMIN KEYBOARD
    } catch (error) {
      console.error("Error fetching pending slips:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred while fetching pending slips.", adminKeyboard); // <<< SEND ADMIN KEYBOARD
    }
  });

  // --- Admin: /pendingupgrades Command to view pending balance upgrades ---
  bot.onText(/\/pendingupgrades/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      return bot.sendMessage(chatId, "❌ You are not authorized to use this command.", { reply_markup: { remove_keyboard: true } });
    }

    try {
      const usersWithPendingUpgrades = await User.find({ 'upgradeRequest.targetVIP': { $ne: null } });

      if (usersWithPendingUpgrades.length === 0) {
        return bot.sendMessage(chatId, "📭 No pending VIP upgrade requests from balance found.", adminKeyboard); // <<< SEND ADMIN KEYBOARD
      }

      // Send each upgrade request as a separate message with buttons
      for (const user of usersWithPendingUpgrades) {
        // Ensure upgradeRequest and its properties exist
        const targetVIP = user.upgradeRequest && user.upgradeRequest.targetVIP ? user.upgradeRequest.targetVIP : 'N/A';
        const requestedAt = user.upgradeRequest && user.upgradeRequest.requestedAt ? user.upgradeRequest.requestedAt.toLocaleString() : 'N/A';

        const messageText = `⬆️ VIP Upgrade Request:
🧑 User: ${user.fullName || user.username || `ID: ${user.telegramId}`}
MongoDB ID: ${user._id}
🎯 Target VIP Level: ${targetVIP}
💰 Current Balance: LKR ${user.balance.toFixed(2)}
🕒 Requested At: ${requestedAt}`;

        await bot.sendMessage(chatId, messageText, {
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Approve Upgrade", callback_data: `approveUpgrade_${user._id}` },
              { text: "❌ Deny Upgrade", callback_data: `denyUpgrade_${user._id}` }
            ]]
          }
        });
      }
      // After all upgrades are sent, explicitly send a confirmation message with the admin keyboard
      await bot.sendMessage(chatId, "Above are all pending VIP upgrade requests.", adminKeyboard); // <<< Optional: summary + ADMIN KEYBOARD
    } catch (error) {
      console.error("Error fetching pending upgrades:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred while fetching pending upgrade requests.", adminKeyboard); // <<< SEND ADMIN KEYBOARD
    }
  });

  // --- NEW: Admin: /userstats Command to view user summaries ---
  bot.onText(/\/userstats/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      return bot.sendMessage(chatId, "❌ You are not authorized to use this command.", { reply_markup: { remove_keyboard: true } });
    }

    try {
      // Fetch users with necessary fields
      const users = await User.find({}).select('fullName username telegramId vipLevel upgradeHistory withdrawals balance');

      if (users.length === 0) {
        return bot.sendMessage(chatId, "📭 No users found in the database.", adminKeyboard); // <<< SEND ADMIN KEYBOARD
      }

      let overallTotalDeposits = 0;
      let overallTotalWithdrawals = 0;

      const BATCH_SIZE = 15; // Number of users per message to avoid Telegram limits
      let initialMessage = "📊 User Statistics Summary:\n\n";
      let usersMessage = "";
      let sentCount = 0;

      for (const user of users) {
        // SAFELY access upgradeHistory and withdrawals, defaulting to empty array if undefined
        const userUpgradeHistory = user.upgradeHistory || [];
        const userWithdrawals = user.withdrawals || [];

        const totalDeposited = userUpgradeHistory.reduce((sum, upgrade) => {
          // Ensure upgrade.level exists and is valid
          // FIX: Changed 'boolean' to 'number' for upgrade.level type check
          const cost = (upgrade && typeof upgrade.level === 'number') ? GOLD_COST[upgrade.level] || 0 : 0;
          return sum + cost;
        }, 0);

        const totalApprovedWithdrawals = userWithdrawals.reduce((sum, withdrawal) => {
          // Ensure withdrawal.status and withdrawal.amount exist
          return sum + ((withdrawal && withdrawal.status === 'approved' && typeof withdrawal.amount === 'number') ? withdrawal.amount : 0);
        }, 0);

        overallTotalDeposits += totalDeposited; // Accumulate for overall total
        overallTotalWithdrawals += totalApprovedWithdrawals; // Accumulate for overall total


        usersMessage += `🧑‍💻 **${user.fullName || user.username || `User ID: ${user.telegramId}`}**
  ⭐ VIP: ${user.vipLevel}
  Deposited: LKR ${totalDeposited.toFixed(2)}
  Withdrawn: LKR ${totalApprovedWithdrawals.toFixed(2)}
  Balance: LKR ${user.balance.toFixed(2)}\n\n`;

        sentCount++;
        if (sentCount % BATCH_SIZE === 0 && usersMessage.length > 0) {
          await bot.sendMessage(chatId, initialMessage + usersMessage, { parse_mode: 'Markdown' });
          initialMessage = ""; // Clear initial message for subsequent batches
          usersMessage = "";
        }
      }

      // Send any remaining users in the last batch
      if (usersMessage.length > 0) {
        await bot.sendMessage(chatId, initialMessage + usersMessage, { parse_mode: 'Markdown' });
      }

      // Add overall totals at the end
      const finalSummary = `--- Overall Totals ---\n` +
                           `Total Deposits (across all approved upgrades): LKR **${overallTotalDeposits.toFixed(2)}**\n` +
                           `Total Withdrawals (across all approved withdrawals): LKR **${overallTotalWithdrawals.toFixed(2)}**`;
      await bot.sendMessage(chatId, finalSummary, { parse_mode: 'Markdown', ...adminKeyboard }); // <<< SEND ADMIN KEYBOARD with final summary

    } catch (error) {
      console.error("Error fetching user stats:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred while fetching user statistics.", adminKeyboard); // <<< SEND ADMIN KEYBOARD
    }
  });


  // === Admin: /withdrawals Command to view pending withdrawals ===
  bot.onText(/\/withdrawals/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
      return bot.sendMessage(chatId, "❌ You are not authorized to use this command.", { reply_markup: { remove_keyboard: true } });
    }

    try {
      // Project 'balance' in addition to other fields needed
      const usersWithPendingWithdrawals = await User.find({ 'withdrawals.status': 'pending' }).select('fullName username telegramId balance paymentDetails withdrawals');

      if (usersWithPendingWithdrawals.length === 0) {
        return bot.sendMessage(chatId, "📭 No pending withdrawal requests found at this time.", adminKeyboard); // <<< SEND ADMIN KEYBOARD
      }

      // Send each withdrawal request as a separate message with buttons
      for (const user of usersWithPendingWithdrawals) {
        // Ensure user.withdrawals is an array before filtering
        const userWithdrawals = user.withdrawals || [];
        const pendingWithdrawals = userWithdrawals.filter(w => w.status === 'pending');

        // Only process if there are actual pending withdrawals for this user
        if (pendingWithdrawals.length === 0) {
          continue;
        }

        for (const withdrawal of pendingWithdrawals) {
          // Add more robust checks for paymentDetails fields and withdrawal properties
          const bankName = user.paymentDetails && user.paymentDetails.bankName ? user.paymentDetails.bankName : 'N/A';
          const accountNumber = user.paymentDetails && user.paymentDetails.accountNumber ? user.paymentDetails.accountNumber : 'N/A';
          const accountName = user.paymentDetails && user.paymentDetails.accountName ? user.paymentDetails.accountName : 'N/A';
          const branch = user.paymentDetails && user.paymentDetails.branch ? user.paymentDetails.branch : 'N/A';

          const withdrawalAmount = typeof withdrawal.amount === 'number' ? withdrawal.amount.toFixed(2) : 'N/A';
          const withdrawalFee = typeof withdrawal.fee === 'number' ? withdrawal.fee.toFixed(2) : 'N/A';
          const requestedAt = withdrawal.requestedAt ? withdrawal.requestedAt.toLocaleString() : 'N/A';


          const messageText = `💸 Withdrawal Request:
🧑 User: ${user.fullName || user.username || `ID: ${user.telegramId}`}
MongoDB User ID: ${user._id}
MongoDB Withdrawal ID: ${withdrawal._id || 'N/A'}
💰 Amount: LKR ${withdrawalAmount} (Fee: LKR ${withdrawalFee})
💳 **User's Current Balance: LKR ${user.balance.toFixed(2)}**
🏦 Bank: ${bankName} - ${accountNumber}
👤 Acc Name: ${accountName}
Branch: ${branch}
🕒 Requested At: ${requestedAt}`;

          await bot.sendMessage(chatId, messageText, {
            reply_markup: {
              inline_keyboard: [
                [ // Row 1: Approve/Reject buttons
                  // SHORTENED CALLBACK_DATA HERE
                  { text: "✅ Approve Withdrawal", callback_data: `appW_${user._id}_${withdrawal._id}` },
                  { text: "❌ Reject Withdrawal", callback_data: `rejW_${user._id}_${withdrawal._id}` }
                ],
                [ // Row 2: View User Details button
                  { text: "👁️ View User Details", callback_data: `viewUserDetails_${user._id}` }
                ]
              ]
            }
          });
        }
      }
      // After all withdrawals are sent, explicitly send a confirmation message with the admin keyboard
      await bot.sendMessage(chatId, "Above are all pending withdrawal requests.", adminKeyboard); // <<< Optional: summary + ADMIN KEYBOARD
    } catch (error) {
      console.error("Error fetching pending withdrawals:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred while fetching pending withdrawal requests.", adminKeyboard); // <<< SEND ADMIN KEYBOARD
    }
  });


  // --- Handle all inline keyboard callbacks ---
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const adminId = callbackQuery.from.id;

    if (!isAdmin(adminId)) {
      // For unauthorized callback queries, just answer the query, no need to send keyboard
      return bot.answerCallbackQuery(callbackQuery.id, { text: "❌ You are not authorized." });
    }

    // Slip approval/rejection
    const matchApproveSlip = data.match(/^approveSlip_(.+)$/);
    const matchRejectSlip = data.match(/^rejectSlip_(.+)$/);

    // Upgrade approval/rejection
    const matchApproveUpgrade = data.match(/^approveUpgrade_(.+)$/);
    const matchDenyUpgrade = data.match(/^denyUpgrade_(.+)$/);

    // Withdrawal approval/rejection (UPDATED REGEX FOR SHORTENED PREFIXES)
    const matchApproveWithdrawal = data.match(/^appW_(.+?)_(.+)$/);
    const matchRejectWithdrawal = data.match(/^rejW_(.+?)_(.+)$/);

    // View User Details (NEW)
    const matchViewUserDetails = data.match(/^viewUserDetails_(.+)$/);


    // --- Slip Handling ---
    if (matchApproveSlip) {
      const userId = matchApproveSlip[1];
      const result = await userController.adminGoldApprove(userId, true, bot);
      if (result.success) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: "✅ Gold purchase approved! VIP Level granted." });
        const user = result.user;
        if (user && user.telegramId) {
            await bot.sendMessage(user.telegramId.toString(), `🎉 Your Gold Level purchase has been approved! You now have **VIP Level ${user.vipLevel}**! Welcome to the VIP Club!`, adminKeyboard); // <<< SEND ADMIN KEYBOARD
        }
        await bot.editMessageCaption(callbackQuery.message.caption + `\n\nStatus: ✅ Approved by ${callbackQuery.from.first_name}`, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          reply_markup: { inline_keyboard: [] } // Remove buttons after action
        });
        await bot.sendMessage(chatId, "Action processed successfully.", adminKeyboard); // <<< Ensure admin keyboard is present
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Approval failed: ${result.message}` });
        await bot.sendMessage(chatId, "Action failed.", adminKeyboard); // <<< Ensure admin keyboard is present
      }
    }

    if (matchRejectSlip) {
      const userId = matchRejectSlip[1];
      const result = await userController.adminGoldApprove(userId, false, bot);
      if (result.success) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Gold purchase rejected." });
        const user = result.user;
        if (user && user.telegramId) {
            await bot.sendMessage(user.telegramId.toString(), "❌ Your Gold purchase request was rejected. Please review your payment slip and try again, or contact support.", adminKeyboard); // <<< SEND ADMIN KEYBOARD
        }
        await bot.editMessageCaption(callbackQuery.message.caption + `\n\nStatus: ❌ Rejected by ${callbackQuery.from.first_name}`, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          reply_markup: { inline_keyboard: [] } // Remove buttons after action
        });
        await bot.sendMessage(chatId, "Action processed successfully.", adminKeyboard); // <<< Ensure admin keyboard is present
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Rejection failed: ${result.message}` });
        await bot.sendMessage(chatId, "Action failed.", adminKeyboard); // <<< Ensure admin keyboard is present
      }
    }

    // --- Upgrade Handling ---
    if (matchApproveUpgrade) {
      const userId = matchApproveUpgrade[1];
      const result = await userController.adminApproveUpgradeFromBalance(userId, true, bot);
      if (result.success) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: "✅ VIP upgrade approved!" });
        const user = result.user;
        if (user && user.telegramId) {
            await bot.sendMessage(user.telegramId.toString(), `🎉 Your VIP Level upgrade from balance has been approved! You are now VIP Level ${user.vipLevel}!`, adminKeyboard); // <<< SEND ADMIN KEYBOARD
        }
        await bot.editMessageText(callbackQuery.message.text + `\n\nStatus: ✅ Approved by ${callbackQuery.from.first_name}`, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          reply_markup: { inline_keyboard: [] } // Remove buttons after action
        });
        await bot.sendMessage(chatId, "Action processed successfully.", adminKeyboard); // <<< Ensure admin keyboard is present
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Approval failed: ${result.message}` });
        await bot.sendMessage(chatId, "Action failed.", adminKeyboard); // <<< Ensure admin keyboard is present
      }
    }

    if (matchDenyUpgrade) {
      const userId = matchDenyUpgrade[1];
      const result = await userController.adminApproveUpgradeFromBalance(userId, false, bot);
      if (result.success) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ VIP upgrade denied." });
        const user = result.user;
        if (user && user.telegramId) {
            await bot.sendMessage(user.telegramId.toString(), `❌ Your VIP Level upgrade request from balance has been denied. The amount will be refunded to your balance if it was already deducted.`, adminKeyboard); // <<< SEND ADMIN KEYBOARD
        }
        await bot.editMessageText(callbackQuery.message.text + `\n\nStatus: ❌ Denied by ${callbackQuery.from.first_name}`, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          reply_markup: { inline_keyboard: [] } // Remove buttons after action
        });
        await bot.sendMessage(chatId, "Action processed successfully.", adminKeyboard); // <<< Ensure admin keyboard is present
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Denial failed: ${result.message}` });
        await bot.sendMessage(chatId, "Action failed.", adminKeyboard); // <<< Ensure admin keyboard is present
      }
    }

    // --- Withdrawal Handling ---
    if (matchApproveWithdrawal) {
      const mongoUserId = matchApproveWithdrawal[1];
      const withdrawalId = matchApproveWithdrawal[2];
      const user = await User.findById(mongoUserId); // Fetch user to get telegramId for userController method

      if (!user) {
          await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ User not found." });
          await bot.sendMessage(chatId, "Action failed: User not found.", adminKeyboard); // <<< Ensure admin keyboard is present
          return;
      }

      const result = await userController.adminWithdrawalProcess(user.telegramId.toString(), withdrawalId, true);
      if (result.success) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: "✅ Withdrawal approved!" });
        // Send message to the user who requested withdrawal
        if (user.telegramId) {
            // Find the specific withdrawal that was approved for accurate amount
            const approvedWithdrawal = result.user.withdrawals.id(withdrawalId);
            if (approvedWithdrawal) {
              await bot.sendMessage(user.telegramId.toString(), `✅ Your withdrawal request of LKR ${approvedWithdrawal.amount.toFixed(2)} has been approved!`, adminKeyboard); // <<< SEND ADMIN KEYBOARD
            } else {
              await bot.sendMessage(user.telegramId.toString(), `✅ Your withdrawal request has been approved!`, adminKeyboard); // <<< SEND ADMIN KEYBOARD
            }
        }
        // Update the message text to show approval status and remove buttons
        await bot.editMessageText(callbackQuery.message.text + `\n\nStatus: ✅ Approved by ${callbackQuery.from.first_name}`, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          reply_markup: { inline_keyboard: [] } // Remove buttons after action
        });
        await bot.sendMessage(chatId, "Action processed successfully.", adminKeyboard); // <<< Ensure admin keyboard is present
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Approval failed: ${result.message}` });
        await bot.sendMessage(chatId, "Action failed.", adminKeyboard); // <<< Ensure admin keyboard is present
      }
    }

    if (matchRejectWithdrawal) {
      const mongoUserId = matchRejectWithdrawal[1];
      const withdrawalId = matchRejectWithdrawal[2];
      const user = await User.findById(mongoUserId); // Fetch user to get telegramId for userController method

      if (!user) {
          await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ User not found." });
          await bot.sendMessage(chatId, "Action failed: User not found.", adminKeyboard); // <<< Ensure admin keyboard is present
          return;
      }

      const result = await userController.adminWithdrawalProcess(user.telegramId.toString(), withdrawalId, false);
      if (result.success) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Withdrawal rejected." });
        if (user.telegramId) {
            await bot.sendMessage(user.telegramId.toString(), `❌ Your withdrawal request has been rejected. The amount has been refunded to your balance.`, adminKeyboard); // <<< SEND ADMIN KEYBOARD
        }
        // Update the message text to show rejection status and remove buttons
        await bot.editMessageText(callbackQuery.message.text + `\n\nStatus: ❌ Rejected by ${callbackQuery.from.first_name}`, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          reply_markup: { inline_keyboard: [] } // Remove buttons after action
        });
        await bot.sendMessage(chatId, "Action processed successfully.", adminKeyboard); // <<< Ensure admin keyboard is present
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: `❌ Denial failed: ${result.message}` });
        await bot.sendMessage(chatId, "Action failed.", adminKeyboard); // <<< Ensure admin keyboard is present
      }
    }

    // --- View User Details Handling (NEW) ---
    if (matchViewUserDetails) {
      const mongoUserId = matchViewUserDetails[1];
      try {
        const user = await User.findById(mongoUserId); // Fetch user by MongoDB _id

        if (!user) {
          await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ User not found in database." });
          await bot.sendMessage(chatId, "Error: User not found.", adminKeyboard); // <<< Ensure admin keyboard is present
          return;
        }

        // Safely get calculated deposit/withdrawal amounts for this single user
        const userUpgradeHistory = user.upgradeHistory || [];
        const userWithdrawals = user.withdrawals || [];

        const totalDeposited = userUpgradeHistory.reduce((sum, upgrade) => {
          // Ensure upgrade.level exists and is valid
          const cost = (upgrade && typeof upgrade.level === 'number') ? GOLD_COST[upgrade.level] || 0 : 0;
          return sum + cost;
        }, 0);

        const totalApprovedWithdrawals = userWithdrawals.reduce((sum, withdrawal) => {
          return sum + ((withdrawal && withdrawal.status === 'approved' && typeof withdrawal.amount === 'number') ? withdrawal.amount : 0);
        }, 0);

        const message = `
👤 **User Details:**
Telegram ID: \`${escapeMarkdown(user.telegramId.toString())}\`
Username: ${user.username ? `@${escapeMarkdown(user.username)}` : 'N/A'}
Full Name: ${escapeMarkdown(user.fullName || 'N/A')}
Referral Code: \`${escapeMarkdown(user.referralCode)}\`
Referred By: ${user.referredBy ? `\`${escapeMarkdown(user.referredBy)}\`` : 'N/A'}
Verified: ${user.isVerified ? '✅ Yes' : '❌ No'}
VIP Level: ${user.vipLevel}
Current Balance: LKR ${user.balance.toFixed(2)}
Total Deposited: LKR ${totalDeposited.toFixed(2)}
Total Approved Withdrawals: LKR ${totalApprovedWithdrawals.toFixed(2)}

**Bank Details:**
Bank Name: ${escapeMarkdown(user.paymentDetails?.bankName || 'N/A')}
Account No: ${escapeMarkdown(user.paymentDetails?.accountNumber || 'N/A')}
Account Name: ${escapeMarkdown(user.paymentDetails?.accountName || 'N/A')}
Branch: ${escapeMarkdown(user.paymentDetails?.branch || 'N/A')}
        `;
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...adminKeyboard }); // <<< SEND ADMIN KEYBOARD
        await bot.answerCallbackQuery(callbackQuery.id, { text: "User details sent." });
      } catch (error) {
        console.error("Error fetching user details via button:", error);
        await bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Error fetching user details." });
        await bot.sendMessage(chatId, "Error fetching user details.", adminKeyboard); // <<< Ensure admin keyboard is present
      }
    }
  });
}

module.exports = { registerAdminCommands };

// commands/userCommands.js

const User = require('../models/User');
const userController = require('../controllers/userController');
const { WITHDRAWAL_FEE, MIN_WITHDRAWAL_AMOUNT, GOLD_COST, SUPPORT_BOT_USERNAME } = require('../constants');

// Using a Map to store user-specific states for multi-step conversations
const userStates = new Map();

// Removed the local mainMenuKeyboard definition
// The user keyboard will now be passed as a parameter from index.js

function registerUserCommands(bot, channelIdentifier, isAdmin, userKeyboard) { // ADDED isAdmin, userKeyboard parameters

  // Assign the passed userKeyboard to a local constant for consistent naming
  const currentMainMenuKeyboard = userKeyboard;

  // --- Define Command Handler Functions ---

  const handleStartCommand = async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const userTelegramUsername = msg.from.username;
    const param = match ? match[1] : null;

    let referredBy = null;
    if (param && param.startsWith('ref_')) {
      referredBy = param.substring(4);
    }

    try {
      let user = await User.findOne({ telegramId });

      if (!user) {
        const registrationResult = await userController.registerUser(
            telegramId,
            userTelegramUsername,
            referredBy
        );

        if (registrationResult.success) {
          user = registrationResult.user;
          let welcomeMessage = `🎉 Welcome, ${user.fullName || user.username || 'new user'}! Your account has been created.`;
          if (referredBy) {
              welcomeMessage += `\n\nYou were referred by code: \`${referredBy}\`.`;
          }
          await bot.sendMessage(chatId, welcomeMessage, currentMainMenuKeyboard);
        } else {
          await bot.sendMessage(chatId, `Failed to register: ${registrationResult.message}`, currentMainMenuKeyboard);
        }
      } else {
        await bot.sendMessage(chatId, `👋 Welcome back, ${user.fullName || user.username}!`, currentMainMenuKeyboard);
      }
    } catch (error) {
      console.error('Error in handleStartCommand:', error);
      await bot.sendMessage(chatId, "⚠️ An error occurred while processing your /start command. Please try again later.", currentMainMenuKeyboard);
    }
  };

  const handleVerifyCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const user = await User.findOne({ telegramId });

    // Admins should not be using user /verify command
    if (isAdmin(telegramId)) { // Uses the passed isAdmin function
        return;
    }

    if (!user) {
        return bot.sendMessage(chatId, "Please /start the bot first.", currentMainMenuKeyboard);
    }

    if (user.isVerified) {
        return bot.sendMessage(chatId, "✅ You are already verified!", currentMainMenuKeyboard);
    }

    try {
      const channelApiId = channelIdentifier.startsWith('-100') ? channelIdentifier : `@${channelIdentifier}`;
      const chatMember = await bot.getChatMember(channelApiId, telegramId);

      if (chatMember && (chatMember.status === 'member' || chatMember.status === 'creator' || chatMember.status === 'administrator')) {
        const updateResult = await userController.verifyUser(telegramId, msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : ''), msg.from.username);
        if (updateResult.success) {
          await bot.sendMessage(chatId, "🎉 You have been successfully verified!", currentMainMenuKeyboard);
        } else {
          await bot.sendMessage(chatId, `Failed to verify: ${updateResult.message}`, currentMainMenuKeyboard);
        }
      } else {
        await bot.sendMessage(chatId,
          `❌ You must join our channel to use this bot: t.me/${channelIdentifier}\n\nAfter joining, click /verify again.`,
          currentMainMenuKeyboard
        );
      }
    } catch (error) {
      console.error('Error during verification:', error);
      if (error.response && error.response.body && error.response.body.description === 'Bad Request: user not found') {
        await bot.sendMessage(chatId, "It seems you haven't started a chat with me or joined the channel. Please join the channel and try again.", currentMainMenuKeyboard);
      } else {
        await bot.sendMessage(chatId, "⚠️ An error occurred during verification. Please try again later.", currentMainMenuKeyboard);
      }
    }
  };


  const handleMyBalanceCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    // Prevent admins from seeing user balance
    if (isAdmin(telegramId)) { // Uses the passed isAdmin function
        return;
    }
    try {
      const result = await userController.getUserDetails(telegramId);
      if (result.success) {
        const user = result.user;

        let message = `**💰 Your Balance:** LKR ${user.balance.toFixed(2)}\n\n`;
        message += `**⭐️ VIP Level:** ${user.vipLevel}\n`;
        message += `**💸 Total Commission Earned:** LKR ${user.commissionEarned.toFixed(2)}\n\n`;

        if (user.upgradeHistory && user.upgradeHistory.length > 0) {
            message += `**⬆️ Recent Upgrades:**\n`;
            user.upgradeHistory.slice(-3).reverse().forEach(upgrade => {
                message += `  - VIP ${upgrade.level} (LKR ${upgrade.cost}) on ${new Date(upgrade.approvedAt).toLocaleDateString()} via ${upgrade.approvedBy}\n`;
            });
        } else {
            message += `**⬆️ Recent Upgrades:** None\n`;
        }

        if (user.withdrawals && user.withdrawals.length > 0) {
            message += `\n**💳 Recent Withdrawals:**\n`;
            user.withdrawals.slice(-3).reverse().forEach(withdrawal => {
                const statusEmoji = withdrawal.status === 'approved' ? '✅' : (withdrawal.status === 'pending' ? '⏳' : '❌');
                message += `  - LKR ${withdrawal.amount.toFixed(2)} (${statusEmoji} ${withdrawal.status}) on ${new Date(withdrawal.requestedAt).toLocaleDateString()}\n`;
            });
        } else {
            message += `\n**💳 Recent Withdrawals:** None\n`;
        }

        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...currentMainMenuKeyboard });
      } else {
        await bot.sendMessage(chatId, `❌ Error: ${result.message}`, currentMainMenuKeyboard);
      }
    } catch (error) {
      console.error("Error in /mybalance command:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred while fetching your balance.", currentMainMenuKeyboard);
    }
  };

  const handleBuyGoldCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    // Prevent admins from seeing user buy gold options
    if (isAdmin(telegramId)) { // Uses the passed isAdmin function
        return;
    }

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", currentMainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first.", currentMainMenuKeyboard);

      const nextVIPLevel = user.vipLevel + 1;
      if (nextVIPLevel > 10) {
        return bot.sendMessage(chatId, "🎉 You have acquired all Gold Levels and reached the highest VIP Level!", currentMainMenuKeyboard);
      }

      const cost = GOLD_COST[nextVIPLevel];
      if (!cost) {
        return bot.sendMessage(chatId, "Invalid Gold Level cost configuration. Please contact support.", currentMainMenuKeyboard);
      }

      let message = `👑 Ready to acquire your next VIP Level? You are currently VIP Level ${user.vipLevel}.
Buy Gold ${nextVIPLevel} for LKR ${cost}.

How would you like to pay?`;

      const keyboard = [
        [{ text: `💸 Pay LKR ${cost} (Bank Transfer)`, callback_data: `show_bank_details_${nextVIPLevel}` }]
      ];

      // Only show "Buy from Account Balance" if user is VIP 1 or higher AND has sufficient balance
      if (user.vipLevel >= 1 && user.balance >= cost) {
        keyboard.push([{ text: `💳 Upgrade using My Balance (LKR ${user.balance.toFixed(2)})`, callback_data: `buy_from_balance_${nextVIPLevel}` }]);
      }

      await bot.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });

    } catch (error) {
      console.error("Error in /buygold command:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred while preparing Gold purchase options.", currentMainMenuKeyboard);
    }
  };

  const handleWithdrawCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    // This check is crucial for preventing admin from seeing user withdrawal flow
    if (isAdmin(telegramId)) { // Uses the passed isAdmin function
        return;
    }

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", currentMainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first.", currentMainMenuKeyboard);

      if (user.balance < MIN_WITHDRAWAL_AMOUNT + WITHDRAWAL_FEE) {
        return bot.sendMessage(chatId, `Your current balance is LKR ${user.balance.toFixed(2)}.
The minimum withdrawal amount is LKR ${MIN_WITHDRAWAL_AMOUNT} + LKR ${WITHDRAWAL_FEE} fee = LKR ${MIN_WITHDRAWAL_AMOUNT + WITHDRAWAL_FEE}.
You need at least LKR ${MIN_WITHDRAWAL_AMOUNT + WITHDRAWAL_FEE} to make a withdrawal.`, currentMainMenuKeyboard);
      }

      if (user.vipLevel === 0) {
          return bot.sendMessage(chatId, "🚫 You must acquire a VIP Level (Gold Level) to use the withdrawal feature.", currentMainMenuKeyboard);
      }

      if (!user.paymentDetails || !user.paymentDetails.accountNumber) {
        await bot.sendMessage(chatId, `You need to add your bank account details before requesting a withdrawal.
Please use the "Add Bank Details" button below or command /addpaymentdetails.`, currentMainMenuKeyboard);
        return;
      }

      userStates.set(telegramId, { command: 'withdraw', step: 'ask_amount' });
      await bot.sendMessage(chatId, `What amount (LKR) would you like to withdraw?
(Minimum: LKR ${MIN_WITHDRAWAL_AMOUNT}, Fee: LKR ${WITHDRAWAL_FEE}. Your current balance: LKR ${user.balance.toFixed(2)})`, { reply_markup: { remove_keyboard: true } });

    } catch (error) {
      console.error("Error in /withdraw command:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred while initiating withdrawal.", currentMainMenuKeyboard);
    }
  };

  const handleReferralsCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    // Prevent admins from seeing user referrals
    if (isAdmin(telegramId)) { // Uses the passed isAdmin function
        return;
    }

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", currentMainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first.", currentMainMenuKeyboard);

      const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=ref_${user.referralCode}`;
      const referredUsers = await User.find({ referredBy: user.referralCode });

      let message = `🔗 Your Referral Link: \n\`${referralLink}\`\n\n`;

      if (referredUsers.length === 0) {
        message += "👥 You haven't referred any users yet.";
      } else {
        message += `👥 Your Referred Users (${referredUsers.length}):\n`;
        referredUsers.sort((a, b) => {
            if (b.vipLevel !== a.vipLevel) {
                return b.vipLevel - a.vipLevel;
            }
            return (a.username || '').localeCompare(b.username || '');
        }).forEach((refUser, index) => {
          message += `${index + 1}. ${refUser.fullName || refUser.username || `User ID: ${refUser.telegramId}`} (VIP: ${refUser.vipLevel}, Verified: ${refUser.isVerified ? '✅' : '❌'})\n`;
        });
      }
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...currentMainMenuKeyboard });

    } catch (error) {
      console.error("Error fetching referral data:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred while fetching referral data. Please try again later.", currentMainMenuKeyboard);
    }
  };

  const handleAddPaymentDetailsCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    // Prevent admins from using user add payment details
    if (isAdmin(telegramId)) { // Uses the passed isAdmin function
        return;
    }

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", currentMainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first.", currentMainMenuKeyboard);

      userStates.set(telegramId, { command: 'add_payment_details', step: 'ask_bank_name' });
      await bot.sendMessage(chatId, "Please enter your Bank Name:", { reply_markup: { remove_keyboard: true } });
    } catch (error) {
      console.error("Error in /addpaymentdetails command:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred.", currentMainMenuKeyboard);
    }
  };

  const handleSupportCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    // Prevent admins from using user support
    if (isAdmin(telegramId)) { // Uses the passed isAdmin function
        return;
    }

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", currentMainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first.", currentMainMenuKeyboard);

      await bot.sendMessage(chatId, "Click the button below to contact our support team:", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📞 Contact Support", url: `https://t.me/${SUPPORT_BOT_USERNAME}` }]
          ]
        }
      });
    } catch (error) {
      console.error("Error in handleSupportCommand:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred while trying to connect you to support.", currentMainMenuKeyboard);
    }
  };


  // --- Register Command Listeners ---
  bot.onText(/\/start(?: (.+))?/, handleStartCommand);
  bot.onText(/\/verify/, handleVerifyCommand);
  bot.onText(/\/mybalance|💰 My Balance/, handleMyBalanceCommand);
  bot.onText(/\/buygold|👑 Buy Gold/, handleBuyGoldCommand);
  bot.onText(/\/withdraw|💳 Withdraw Funds/, handleWithdrawCommand);
  bot.onText(/\/referrals|🔗 My Referrals/, handleReferralsCommand);
  bot.onText(/\/addpaymentdetails|🏦 Add Bank Details/, handleAddPaymentDetailsCommand);
  bot.onText(/❓ Support/, handleSupportCommand);


  // --- General message handler for multi-step conversations and new user fallback ---
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const messageText = msg.text;

    // Updated knownTexts array based on your specific list from the previous turn
    const knownTexts = [
        '💰 My Balance', '👑 Buy Gold', '🔗 My Referrals', '💳 Withdraw Funds',
        '🏦 Add Bank Details', '❓ Support', // Your main menu buttons
        '/start', '/verify', '/mybalance', '/buygold', '/withdraw',
        '/referrals', '/addpaymentdetails', '/admin', '/listslips',
        '/withdrawals', '/pendingupgrades' // Commands
    ];

    const isKnownCommand = messageText && messageText.startsWith('/');
    const isKnownButton = knownTexts.includes(messageText);

    // If it's a known command/button or an admin, immediately return to avoid processing as text input
    if (isKnownCommand || isKnownButton || isAdmin(telegramId)) { // Uses the passed isAdmin function
        return;
    }

    const state = userStates.get(telegramId);

    if (state) {
        switch (state.command) {
            case 'collect_name':
                if (state.step === 'ask_name') {
                    const fullName = messageText.trim();
                    if (!fullName) {
                        await bot.sendMessage(chatId, "Please provide a valid name.");
                        return;
                    }

                    userStates.delete(telegramId);

                    const userTelegramUsername = msg.from.username;
                    const result = await userController.verifyUser(telegramId, fullName, userTelegramUsername);
                    if (result.success) {
                        const user = result.user;
                        await bot.sendMessage(chatId, `✅ Account verified, ${user.fullName || user.username || 'User'}! Your referral link is:
\`https://t.me/${process.env.BOT_USERNAME}?start=ref_${user.referralCode}\`
Share this link to invite others and earn commissions!`, currentMainMenuKeyboard);
                    } else {
                        await bot.sendMessage(chatId, `❌ Verification failed: ${result.message}`, currentMainMenuKeyboard);
                    }
                }
                break;

            case 'withdraw':
                if (state.step === 'ask_amount') {
                  const amount = parseFloat(messageText);
                  if (isNaN(amount) || amount <= 0) {
                    await bot.sendMessage(chatId, "Please enter a valid positive number for the amount.");
                    return;
                  }
                  const user = await User.findOne({ telegramId });
                  if (!user) {
                      userStates.delete(telegramId);
                      return bot.sendMessage(chatId, "User session expired. Please try /withdraw again.", currentMainMenuKeyboard);
                  }

                  const totalDeduction = amount + WITHDRAWAL_FEE;
                  if (user.balance < totalDeduction) {
                      userStates.delete(telegramId);
                      return bot.sendMessage(chatId, `Insufficient balance. You need LKR ${totalDeduction.toFixed(2)} (LKR ${amount.toFixed(2)} + LKR ${WITHDRAWAL_FEE} fee). Your current balance: LKR ${user.balance.toFixed(2)}.`, currentMainMenuKeyboard);
                  }

                  userStates.set(telegramId, { ...state, step: 'confirm_withdraw', data: { amount } });

                  await bot.sendMessage(chatId, `You are requesting to withdraw LKR ${amount.toFixed(2)}.
A fee of LKR ${WITHDRAWAL_FEE} will be applied.
Total deduction from your balance: LKR ${totalDeduction.toFixed(2)}.
This will take maximum 24 hours to proceed.

Do you confirm this withdrawal?`, {
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: "✅ Confirm Withdrawal", callback_data: `confirm_withdraw_${amount}` }],
                        [{ text: "❌ Cancel", callback_data: "cancel_withdraw" }]
                      ]
                    }
                  });
                }
                break;

            case 'add_payment_details':
                if (state.step === 'ask_bank_name') {
                  userStates.set(telegramId, { ...state, step: 'ask_account_number', data: { bankName: messageText } });
                  await bot.sendMessage(chatId, "Please enter your Bank Account Number:");
                } else if (state.step === 'ask_account_number') {
                  userStates.set(telegramId, { ...state, step: 'ask_account_name', data: { ...state.data, accountNumber: messageText } });
                  await bot.sendMessage(chatId, "Please enter your Account Holder Name:");
                } else if (state.step === 'ask_account_name') {
                  userStates.set(telegramId, { ...state, step: 'ask_branch', data: { ...state.data, accountName: messageText } });
                  await bot.sendMessage(chatId, "Please enter your Bank Branch:");
                } else if (state.step === 'ask_branch') {
                  userStates.delete(telegramId);
                  const { bankName, accountNumber, accountName } = state.data;
                  const branch = messageText;

                  const result = await userController.updatePaymentDetails(telegramId, bankName, accountNumber, accountName, branch);
                  if (result.success) {
                    await bot.sendMessage(chatId, "✅ Your bank account details have been saved!", currentMainMenuKeyboard);
                  } else {
                    await bot.sendMessage(chatId, `❌ Failed to save details: ${result.message}`, currentMainMenuKeyboard);
                  }
                }
                break;

            case 'upload_payment_slip':
                if (msg.photo && msg.photo.length > 0) {
                  userStates.delete(telegramId);
                  const requestedGoldLevel = state.data.level;

                  const result = await userController.goldPurchaseRequest(telegramId, requestedGoldLevel, msg.photo[msg.photo.length - 1].file_id);
                  if (result.success) {
                    await bot.sendMessage(chatId, `✅ Your payment slip for Gold Level ${requestedGoldLevel} has been submitted.
This will grant you VIP Level ${requestedGoldLevel}. Please wait for admin approval (usually within 24 hours). We will notify you once it's approved.`, currentMainMenuKeyboard);
                  } else {
                    await bot.sendMessage(chatId, `❌ Failed to submit request: ${result.message}`, currentMainMenuKeyboard);
                  }
                } else {
                  await bot.sendMessage(chatId, "Please send a photo of your payment slip.", { reply_markup: { remove_keyboard: true } });
                }
                break;

            case 'confirm_balance_upgrade':
                const user = await User.findOne({ telegramId });
                if (!user) {
                    userStates.delete(telegramId);
                    return bot.sendMessage(chatId, "User session expired. Please try again.", currentMainMenuKeyboard);
                }
                const targetVIP = state.data.targetVIP;
                const cost = GOLD_COST[targetVIP];

                if (messageText.toLowerCase() === 'yes') {
                    if (user.balance < cost) {
                        userStates.delete(telegramId);
                        return bot.sendMessage(chatId, `❌ Your balance (LKR ${user.balance.toFixed(2)}) is no longer sufficient for VIP Level ${targetVIP} (Cost: LKR ${cost}). Upgrade cancelled.`, currentMainMenuKeyboard);
                    }
                    userStates.delete(telegramId);
                    const result = await userController.requestUpgradeFromBalance(telegramId, targetVIP);
                    if (result.success) {
                        await bot.sendMessage(chatId, `✅ VIP Level ${targetVIP} upgrade request submitted using your balance. Awaiting admin approval.`, currentMainMenuKeyboard);
                    } else {
                        await bot.sendMessage(chatId, `❌ Upgrade failed: ${result.message}`, currentMainMenuKeyboard);
                    }
                } else if (messageText.toLowerCase() === 'no') {
                    userStates.delete(telegramId);
                    await bot.sendMessage(chatId, "❌ Upgrade from balance cancelled.", currentMainMenuKeyboard);
                } else {
                    await bot.sendMessage(chatId, "Please reply 'yes' to confirm or 'no' to cancel.");
                }
                break;

            default:
                userStates.delete(telegramId);
                await bot.sendMessage(chatId, "Invalid response for current operation. Please use a menu button or /start.", currentMainMenuKeyboard);
                break;
        }
        return;
    }

    let user = await User.findOne({ telegramId });

    if (!user) {
      await bot.sendMessage(chatId, "👋 Welcome! To begin, please click the 'Start' button below or type /start.", {
          reply_markup: {
              inline_keyboard: [
                  [{ text: "🚀 Start Bot", callback_data: "trigger_start_command" }]
              ]
          }
      });
      return;
    }
    if (!user.isVerified) {
      await bot.sendMessage(chatId, `🔐 Please verify your account by joining our channel and confirming.
Channel: t.me/${channelIdentifier}
Then type /verify`, currentMainMenuKeyboard);
      return;
    }
    await bot.sendMessage(chatId, "I don't understand that. Please use the menu buttons or commands.", currentMainMenuKeyboard);
  });


  // --- Handle inline keyboard callbacks for user actions ---
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id.toString();
    const data = callbackQuery.data;

    await bot.answerCallbackQuery(callbackQuery.id);

    // If an admin clicks an inline keyboard button, this should handle it
    if (isAdmin(telegramId)) { // Uses the passed isAdmin function
      await bot.answerCallbackQuery(callbackQuery.id, { text: "Admin actions are handled separately." });
      return;
    }

    try {
      const user = await User.findOne({ telegramId });
      if (!user || !user.isVerified) {
          if (data === 'trigger_start_command') {
            const userTelegramUsername = callbackQuery.from.username;
            const registrationResult = await userController.registerUser(
                telegramId,
                userTelegramUsername,
                null
            );
            if (registrationResult.success) {
                await bot.sendMessage(chatId, `🎉 Welcome to our bot!
To get started, please join our official Telegram Channel for updates and verification:
👉 t.me/${channelIdentifier}

After joining, use the /verify command to verify your account and get your referral link.`, currentMainMenuKeyboard);
            } else {
                await bot.sendMessage(chatId, `❌ Failed to register you: ${registrationResult.message}`, currentMainMenuKeyboard);
            }
          } else {
              await bot.sendMessage(chatId, "Please /start and verify your account first to use this feature.", currentMainMenuKeyboard);
          }
          // Remove the inline keyboard after user interacts
          await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
              chat_id: chatId,
              message_id: callbackQuery.message.message_id
          });
          return;
      }

      if (data.startsWith('show_bank_details_')) {
        const level = parseInt(data.split('_')[3]);
        const cost = GOLD_COST[level];

        const bankDetails = `
🏦 Bank Name: Commercial Bank
💳 Account Number: 8014532722
👤 Account Name: HIRIMBURA M K P A
📍 Branch: Kottawa

Amount to Pay: LKR ${cost} for Gold Level ${level}.
This will grant you VIP Level ${level}.

After payment, please send the payment slip photo in the chat.`;

        await bot.editMessageText(bankDetails, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: "⬆️ I have paid, send slip", callback_data: `upload_slip_for_gold_${level}` }]
            ]
          }
        });
      }

      else if (data.startsWith('upload_slip_for_gold_')) {
        const level = parseInt(data.split('_')[4]);
        userStates.set(telegramId, { command: 'upload_payment_slip', step: 'waiting_for_photo', data: { level } });
        await bot.sendMessage(chatId, `Please send the payment slip photo for Gold Level ${level}.`, { reply_markup: { remove_keyboard: true } });
      }

      else if (data.startsWith('confirm_withdraw_')) {
        const amount = parseFloat(data.split('_')[2]);
        userStates.delete(telegramId);

        const result = await userController.requestWithdrawal(telegramId, amount);
        if (result.success) {
          await bot.sendMessage(chatId, `✅ Withdrawal request for LKR ${amount.toFixed(2)} submitted successfully! It takes maximum 24 hours to proceed.`, currentMainMenuKeyboard);
          // Clear the inline keyboard to prevent re-submission or confusion
          await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
          });
        } else {
          await bot.sendMessage(chatId, `❌ Withdrawal failed: ${result.message}`, currentMainMenuKeyboard);
        }
      }

      else if (data === 'cancel_withdraw') {
        userStates.delete(telegramId);
        await bot.sendMessage(chatId, "❌ Withdrawal request cancelled.", currentMainMenuKeyboard);
        // Clear the inline keyboard
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id
        });
      }

      else if (data.startsWith('buy_from_balance_')) {
        const targetVIP = parseInt(data.split('_')[3]);
        const cost = GOLD_COST[targetVIP];

        if (user.balance < cost) {
            await bot.sendMessage(chatId, `❌ You do not have enough balance (LKR ${user.balance.toFixed(2)}) to upgrade to VIP Level ${targetVIP} (Cost: LKR ${cost}).`);
            return;
        }

        userStates.set(telegramId, { command: 'confirm_balance_upgrade', step: 'ask_confirmation', data: { targetVIP } });
        await bot.sendMessage(chatId, `Are you sure you want to upgrade to VIP Level ${targetVIP} for LKR ${cost} using your balance?
Type 'yes' to confirm or 'no' to cancel.`, { reply_markup: { remove_keyboard: true } });
      }

    } catch (error) {
      console.error("Error in callback query handler:", error);
      await bot.sendMessage(chatId, "⚠️ An unexpected error occurred. Please try again later.", currentMainMenuKeyboard);
    }
  });

  // --- Fallback for unknown commands ---
  // This regex now explicitly excludes all known user commands AND common admin commands/prefixes.
  // This ensures that only truly unknown commands from non-admins trigger this fallback.
  bot.onText(/^\/(?!start|verify|mybalance|buygold|withdraw|referrals|addpaymentdetails|admin|listslips|withdrawals|pendingupgrades|adminapprovewithdraw_|adminrejectwithdraw_|approveupgrade_|denyupgrade_|userstatus).+/, async (msg) => {
      const chatId = msg.chat.id;
      const telegramId = msg.from.id.toString();

      // Crucial check: If the user is an admin, return immediately.
      // This prevents any "Unknown command" message from being sent to admins.
      if (isAdmin(telegramId)) { // Uses the passed isAdmin function
          return;
      }

      const user = await User.findOne({ telegramId });

      if (!user) {
          // If it's an unknown command from a completely new user, prompt for /start
          await bot.sendMessage(chatId, "👋 Welcome! Please use the /start command to begin.", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🚀 Start Bot", callback_data: "trigger_start_command" }]
                ]
            }
          });
          return;
      }
      // For existing users with unknown commands
      await bot.sendMessage(chatId, "🤖 Unknown command. Please use the menu or type /start to see available commands.", currentMainMenuKeyboard);
  });

}

module.exports = { registerUserCommands };

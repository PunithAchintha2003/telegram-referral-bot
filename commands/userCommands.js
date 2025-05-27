// commands/userCommands.js

const User = require('../models/User');
const userController = require('../controllers/userController');
const { WITHDRAWAL_FEE, MIN_WITHDRAWAL_AMOUNT } = require('../constants');
const { getVipCost } = require('../utils/pricing');

// Using a Map to store user-specific states for multi-step conversations
const userStates = new Map();

// --- Main Menu Reply Keyboard Definition ---
const mainMenuKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '💰 My Balance' }, { text: '🚀 Buy VIP' }],
      [{ text: '🔗 My Referrals' }, { text: '💳 Withdraw Funds' }],
      [{ text: '🏦 Add Bank Details' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

function registerUserCommands(bot, channelIdentifier) {

  // --- Define Command Handler Functions ---

  const handleStartCommand = async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const userTelegramUsername = msg.from.username;
    const param = match ? match[1] : null; // Match might be null if called from button

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
          await bot.sendMessage(chatId, `🎉 Welcome to our bot!
To get started, please join our official Telegram Channel for updates and verification:
👉 t.me/${channelIdentifier}

After joining, use the /verify command to verify your account and get your referral link.`, mainMenuKeyboard);
        } else {
          await bot.sendMessage(chatId, `❌ Failed to register you: ${registrationResult.message}`, mainMenuKeyboard);
        }
      } else if (!user.isVerified) {
        await bot.sendMessage(chatId, `👋 Welcome back! Your account is not yet verified.
Please join our channel: t.me/${channelIdentifier}
Then use the /verify command to verify your account.`, mainMenuKeyboard);
      } else {
        await bot.sendMessage(chatId, `👋 Welcome back, ${user.fullName || user.username || 'User'}!
Your current VIP Level: ${user.vipLevel}
Your current balance: LKR ${user.balance.toFixed(2)}

Use the menu below to explore options.`, mainMenuKeyboard);
        if (user.username !== userTelegramUsername) {
            user.username = userTelegramUsername;
            await user.save();
        }
      }
    } catch (error) {
      console.error("Error in /start command:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred. Please try again later.", mainMenuKeyboard);
    }
  };

  const handleVerifyCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const userTelegramUsername = msg.from.username;
    const userFullNameFromTelegram = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : ''); // Store this for later


    try {
        const channelApiId = channelIdentifier.startsWith('-100') ? channelIdentifier : `@${channelIdentifier}`;
        const chatMember = await bot.getChatMember(channelApiId, msg.from.id);
        
        let user = await User.findOne({ telegramId }); // Fetch user again

        if (chatMember.status === 'member' || chatMember.status === 'administrator' || chatMember.status === 'creator') {
            if (user && user.isVerified) {
                await bot.sendMessage(chatId, `✅ Your account is already verified, ${user.fullName || user.username || 'User'}!`, mainMenuKeyboard);
                return;
            }

            // User is verified in channel but not in DB, or not yet verified
            // Instead of directly verifying, ask for their full name
            userStates.set(telegramId, { command: 'collect_name', step: 'ask_name', data: { userFullNameFromTelegram } });
            await bot.sendMessage(chatId, `✅ You've successfully joined our channel!
To complete verification, please tell us your **full name** (as you'd like to be addressed):`, { reply_markup: { remove_keyboard: true } }); // Remove keyboard for input

        } else {
            await bot.sendMessage(chatId, `❌ Verification failed. You must join our channel first: t.me/${channelIdentifier}`, mainMenuKeyboard);
        }
    } catch (error) {
        console.error("Error in /verify command:", error);
        if (error.code === 'ETELEGRAM' && error.response && error.response.body && error.response.body.description === 'Bad Request: chat not found') {
            bot.sendMessage(chatId, '⛔️ Verification channel not found. Please contact support.', mainMenuKeyboard);
            console.error(`ERROR: Verify channel ID configuration might be incorrect. Used: ${channelIdentifier}`);
        } else {
            bot.sendMessage(chatId, "⚠️ An error occurred during verification. Please ensure you have joined the channel and try again.", mainMenuKeyboard);
        }
    }
  };

  const handleMyBalanceCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    try {
      const result = await userController.getUserDetails(telegramId);
      if (result.success) {
        const user = result.user;
        await bot.sendMessage(chatId, `💰 Your current account balance is: LKR ${user.balance.toFixed(2)}`, mainMenuKeyboard);
      } else {
        await bot.sendMessage(chatId, `❌ Error: ${result.message}`, mainMenuKeyboard);
      }
    } catch (error) {
      console.error("Error in /mybalance command:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred while fetching your balance.", mainMenuKeyboard);
    }
  };

  const handleBuyVipCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", mainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first.", mainMenuKeyboard);

      const nextVipLevel = user.vipLevel + 1;
      if (nextVipLevel > 10) {
        return bot.sendMessage(chatId, "🎉 You are already at the highest VIP level!", mainMenuKeyboard);
      }

      const cost = getVipCost(nextVipLevel);
      let message = `🚀 Ready to upgrade? You are currently VIP Level ${user.vipLevel}.
The next level is VIP Level ${nextVipLevel} for LKR ${cost}.

How would you like to pay?`;

      const keyboard = [
        [{ text: `💸 Pay with LKR ${cost} (Bank Transfer)`, callback_data: `show_bank_details_${nextVipLevel}` }]
      ];

      if (user.balance >= cost && user.vipLevel >= 1) {
        keyboard.push([{ text: `💳 Buy from Account Balance (LKR ${user.balance.toFixed(2)})`, callback_data: `buy_from_balance_${nextVipLevel}` }]);
      }

      await bot.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });

    } catch (error) {
      console.error("Error in /buyvip command:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred while preparing VIP options.", mainMenuKeyboard);
    }
  };

  const handleWithdrawCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", mainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first.", mainMenuKeyboard);

      if (user.balance < MIN_WITHDRAWAL_AMOUNT + WITHDRAWAL_FEE) {
        return bot.sendMessage(chatId, `Your current balance is LKR ${user.balance.toFixed(2)}.
The minimum withdrawal amount is LKR ${MIN_WITHDRAWAL_AMOUNT} + LKR ${WITHDRAWAL_FEE} fee = LKR ${MIN_WITHDRAWAL_AMOUNT + WITHDRAWAL_FEE}.
You need at least LKR ${MIN_WITHDRAWAL_AMOUNT + WITHDRAWAL_FEE} to make a withdrawal.`, mainMenuKeyboard);
      }

      if (!user.paymentDetails || !user.paymentDetails.accountNumber) {
        await bot.sendMessage(chatId, `You need to add your bank account details before requesting a withdrawal.
Please use the "Add Withdrawal Details" button below or command /addpaymentdetails.`, mainMenuKeyboard);
        return;
      }

      userStates.set(telegramId, { command: 'withdraw', step: 'ask_amount' });
      await bot.sendMessage(chatId, `What amount (LKR) would you like to withdraw?
(Minimum: LKR ${MIN_WITHDRAWAL_AMOUNT}, Fee: LKR ${WITHDRAWAL_FEE}. Total deduction: LKR ${MIN_WITHDRAWAL_AMOUNT + WITHDRAWAL_FEE})`, { reply_markup: { remove_keyboard: true } });

    } catch (error) {
      console.error("Error in /withdraw command:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred while initiating withdrawal.", mainMenuKeyboard);
    }
  };

  const handleReferralsCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", mainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first.", mainMenuKeyboard);

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
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...mainMenuKeyboard });

    } catch (error) {
      console.error("Error in /referrals command:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred while fetching your referrals.", mainMenuKeyboard);
    }
  };

  const handleAddPaymentDetailsCommand = async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    try {
      const user = await User.findOne({ telegramId });
      if (!user) return bot.sendMessage(chatId, "Please /start first.", mainMenuKeyboard);
      if (!user.isVerified) return bot.sendMessage(chatId, "Please /verify your account first.", mainMenuKeyboard);

      userStates.set(telegramId, { command: 'add_payment_details', step: 'ask_bank_name' });
      await bot.sendMessage(chatId, "Please enter your Bank Name:", { reply_markup: { remove_keyboard: true } });
    } catch (error) {
      console.error("Error in /addpaymentdetails command:", error);
      bot.sendMessage(chatId, "⚠️ An unexpected error occurred.", mainMenuKeyboard);
    }
  };


  // --- Register Command Listeners ---

  bot.onText(/\/start(?: (.+))?/, handleStartCommand);
  bot.onText(/\/verify/, handleVerifyCommand);
  bot.onText(/\/mybalance/, handleMyBalanceCommand);
  bot.onText(/\/buyvip/, handleBuyVipCommand);
  bot.onText(/\/withdraw/, handleWithdrawCommand);
  bot.onText(/\/referrals/, handleReferralsCommand);
  bot.onText(/\/addpaymentdetails/, handleAddPaymentDetailsCommand);


  // --- General message handler for button presses and unverified users ---
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const messageText = msg.text;

    // Check for button presses first
    switch (messageText) {
        case '💰 My Balance':
            return handleMyBalanceCommand(msg);
        case '🚀 Buy VIP':
            return handleBuyVipCommand(msg);
        case '🔗 My Referrals':
            return handleReferralsCommand(msg);
        case '💳 Withdraw Funds':
            return handleWithdrawCommand(msg);
        case '🏦 Add Bank Details':
            return handleAddPaymentDetailsCommand(msg);
    }

    // If it's a command starting with '/' and not a button press (which is handled above),
    // and not part of an ongoing multi-step input, let `bot.onText` handle it or the fallback.
    if (messageText && messageText.startsWith('/') && !userStates.has(telegramId)) {
        return; // Let `bot.onText` or the final fallback handle this command
    }

    // --- Handle user replies based on state (for multi-step commands) ---
    const state = userStates.get(telegramId);

    // If there's an active state for this user, process it
    if (state) {
        switch (state.command) {
            case 'collect_name':
                if (state.step === 'ask_name') {
                    const fullName = messageText.trim();
                    if (!fullName) {
                        await bot.sendMessage(chatId, "Please provide a valid name.");
                        return;
                    }

                    userStates.delete(telegramId); // Clear state

                    // Now, proceed with the actual verification using the collected full name
                    const userTelegramUsername = msg.from.username;
                    const result = await userController.verifyUser(telegramId, fullName, userTelegramUsername);
                    if (result.success) {
                        const user = result.user;
                        await bot.sendMessage(chatId, `✅ Account verified, ${user.fullName || user.username || 'User'}! Your referral link is:
\`https://t.me/${process.env.BOT_USERNAME}?start=ref_${user.referralCode}\`
Share this link to invite others and earn commissions!`, mainMenuKeyboard);
                    } else {
                        await bot.sendMessage(chatId, `❌ Verification failed: ${result.message}`, mainMenuKeyboard);
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
                  userStates.set(telegramId, { ...state, step: 'confirm_withdraw', data: { amount } });

                  const totalDeduction = amount + WITHDRAWAL_FEE;
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
                    await bot.sendMessage(chatId, "✅ Your bank account details have been saved!", mainMenuKeyboard);
                  } else {
                    await bot.sendMessage(chatId, `❌ Failed to save details: ${result.message}`, mainMenuKeyboard);
                  }
                }
                break;

            case 'upload_payment_slip':
                if (msg.photo && msg.photo.length > 0) {
                  userStates.delete(telegramId);
                  const fileId = msg.photo[msg.photo.length - 1].file_id;
                  const requestedVipLevel = state.data.level;

                  const result = await userController.vipRequest(telegramId, requestedVipLevel, fileId);
                  if (result.success) {
                    await bot.sendMessage(chatId, `✅ Your payment slip for VIP Level ${requestedVipLevel} has been submitted.
Please wait for admin approval (usually within 24 hours). We will notify you once it's approved.`, mainMenuKeyboard);
                  } else {
                    await bot.sendMessage(chatId, `❌ Failed to submit request: ${result.message}`, mainMenuKeyboard);
                  }
                } else {
                  await bot.sendMessage(chatId, "Please send a photo of your payment slip.", { reply_markup: { remove_keyboard: true } });
                }
                break;
        }
        return; // Important: Return after processing a state to avoid falling into general checks.
    }

    // --- General message handler/verification middleware (only if not a command or state) ---
    // This block runs if it's not a button press, not an explicit command, and not part of a multi-step input.
    try {
      let user = await User.findOne({ telegramId });
      if (!user) {
        await bot.sendMessage(chatId, "👋 Welcome! It looks like you're new or haven't finished setting up. Please use the /start command to begin.", mainMenuKeyboard);
        return;
      }
      // If user is not verified AND not currently in the 'collect_name' state
      if (!user.isVerified && !(state && state.command === 'collect_name')) {
        await bot.sendMessage(chatId, `🔐 Please verify your account by joining our channel and confirming.
Channel: t.me/${channelIdentifier}
Then type /verify`, mainMenuKeyboard);
        return;
      }
    } catch (error) {
      console.error("Error in general message handler/verification middleware:", error);
      bot.sendMessage(chatId, "⚠️ An error occurred while checking your account status. Please try again later.", mainMenuKeyboard);
    }
  });


  // --- Handle inline keyboard callbacks for user actions ---
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id.toString();
    const data = callbackQuery.data;

    await bot.answerCallbackQuery(callbackQuery.id);

    try {
      const user = await User.findOne({ telegramId });
      if (!user || !user.isVerified) { // If user isn't verified, prompt them.
          await bot.sendMessage(chatId, "Please /start and verify your account first to use this feature.", mainMenuKeyboard);
          return;
      }

      if (data.startsWith('show_bank_details_')) {
        const level = parseInt(data.split('_')[3]);
        const cost = getVipCost(level);

        const bankDetails = `
🏦 Bank Name: Commercial Bank
💳 Account Number: 1234567890
👤 Account Name: Your Company Name
📍 Branch: Main Branch, Colombo

Amount to Pay: LKR ${cost} for VIP Level ${level}.

After payment, please send the payment slip photo in the chat.`;

        await bot.editMessageText(bankDetails, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: "⬆️ I have paid, send slip", callback_data: `upload_slip_for_vip_${level}` }]
            ]
          }
        });
      }

      else if (data.startsWith('upload_slip_for_vip_')) {
        const level = parseInt(data.split('_')[4]);
        userStates.set(telegramId, { command: 'upload_payment_slip', step: 'waiting_for_photo', data: { level } });
        await bot.sendMessage(chatId, `Please send the payment slip photo for VIP Level ${level}.`, { reply_markup: { remove_keyboard: true } });
      }

      else if (data.startsWith('confirm_withdraw_')) {
        const amount = parseFloat(data.split('_')[2]);
        userStates.delete(telegramId);

        const result = await userController.requestWithdrawal(telegramId, amount);
        if (result.success) {
          await bot.sendMessage(chatId, `✅ Withdrawal request for LKR ${amount.toFixed(2)} submitted successfully! It takes maximum 24 hours to proceed.`, mainMenuKeyboard);
          await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
          });
        } else {
          await bot.sendMessage(chatId, `❌ Withdrawal failed: ${result.message}`, mainMenuKeyboard);
        }
      }

      else if (data === 'cancel_withdraw') {
        userStates.delete(telegramId);
        await bot.sendMessage(chatId, "❌ Withdrawal request cancelled.", mainMenuKeyboard);
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id
        });
      }

      else if (data.startsWith('buy_from_balance_')) {
        const level = parseInt(data.split('_')[3]);
        const result = await userController.requestUpgradeFromBalance(telegramId, level);
        if (result.success) {
            await bot.sendMessage(chatId, `✅ Your request to upgrade to VIP Level ${level} using your account balance has been submitted for admin approval.`, mainMenuKeyboard);
            const adminGroupId = process.env.ADMIN_GROUP_ID;
            if (adminGroupId) {
                await bot.sendMessage(adminGroupId, `🔔 New VIP upgrade request from balance:
User: ${user.fullName || user.username || user.telegramId} (ID: ${user.telegramId})
Requested VIP: ${level}
Current Balance: LKR ${user.balance.toFixed(2)}

To approve: \`/approveupgrade_${user._id}\`
To deny: \`/denyupgrade_${user._id}\`
`);
            }
        } else {
            await bot.sendMessage(chatId, `❌ Failed to submit upgrade request: ${result.message}`, mainMenuKeyboard);
        }
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id
        });
      }


    } catch (error) {
      console.error("Error in callback query handler:", error);
      await bot.sendMessage(chatId, "⚠️ An unexpected error occurred. Please try again later.", mainMenuKeyboard);
    }
  });

  // --- Fallback for unknown commands ---
  bot.onText(/^\/(?!start|verify|mybalance|buyvip|withdraw|referrals|addpaymentdetails|admin|listslips|withdrawals|pendingupgrades|adminapprovewithdraw_|adminrejectwithdraw_|approveupgrade_|denyupgrade_).+/, async (msg) => {
      const chatId = msg.chat.id;
      await bot.sendMessage(chatId, "🤖 Unknown command. Please use the menu or type /start to see available commands.", mainMenuKeyboard);
  });

}

module.exports = { registerUserCommands };
// userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// These routes are exposed via Express, but the bot will primarily interact
// with the controller functions directly. They are here for completeness
// if you choose to integrate with a separate frontend or webhooks for some features.

// Public user routes
router.post('/register', async (req, res) => {
    const { telegramId, fullName, username, referredBy } = req.body;
    const result = await userController.registerUser(telegramId, username, referredBy);
    if (result.success) res.json(result);
    else res.status(400).json(result);
});

router.post('/verify', async (req, res) => {
    const { telegramId, fullName, username } = req.body;
    const result = await userController.verifyUser(telegramId, fullName, username);
    if (result.success) res.json(result);
    else res.status(400).json(result);
});

router.post('/vip-request', async (req, res) => {
    const { telegramId, requestedVipLevel, paymentSlipFileId } = req.body;
    const result = await userController.vipRequest(telegramId, requestedVipLevel, paymentSlipFileId);
    if (result.success) res.json(result);
    else res.status(400).json(result);
});

router.post('/withdraw', async (req, res) => {
    const { telegramId, amount } = req.body;
    const result = await userController.requestWithdrawal(telegramId, amount);
    if (result.success) res.json(result);
    else res.status(400).json(result);
});

router.post('/update-payment-details', async (req, res) => {
    const { telegramId, bankName, accountNumber, accountName, branch } = req.body;
    const result = await userController.updatePaymentDetails(telegramId, bankName, accountNumber, accountName, branch);
    if (result.success) res.json(result);
    else res.status(400).json(result);
});

router.post('/request-upgrade-balance', async (req, res) => {
    const { telegramId, targetVIP } = req.body;
    const result = await userController.requestUpgradeFromBalance(telegramId, targetVIP);
    if (result.success) res.json(result);
    else res.status(400).json(result);
});

router.get('/user/:telegramId', async (req, res) => {
    const { telegramId } = req.params;
    const result = await userController.getUserDetails(telegramId);
    if (result.success) res.json(result);
    else res.status(404).json(result);
});


// Admin routes (should be protected by admin auth middleware in real use)
// These would typically not be called by the bot itself, but by an external admin panel.
// The bot's admin commands call userController functions directly.
router.post('/admin/vip-approve', async (req, res) => {
    const { userId, approve } = req.body;
    // Note: The bot instance is not available here, this would need to be handled by a separate notification system
    // if this API route is used for approval. For this project, the bot directly handles approval.
    res.status(501).json({ message: "This API route is not directly used for admin approval in this bot setup. Use bot commands." });
});

router.post('/admin/withdrawal-process', async (req, res) => {
    const { telegramId, withdrawalId, approve } = req.body;
    const result = await userController.adminWithdrawalProcess(telegramId, withdrawalId, approve);
    if (result.success) res.json(result);
    else res.status(400).json(result);
});

module.exports = router;
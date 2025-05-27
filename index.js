// index.js
require('dotenv').config(); // Load environment variables from .env file
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('./models/User'); // Adjust path to your User model
const { registerAdminCommands } = require('./commands/adminCommands'); // Only import the function
const { registerUserCommands } = require('./commands/userCommands'); // Import user commands
const expressApp = require('./app'); // Imports the Express app instance

// --- Configuration and Initialization ---

// ✅ Validate essential environment variables early
if (!process.env.BOT_TOKEN || !process.env.MONGO_URI || !process.env.CHANNEL_USERNAME || !process.env.BOT_USERNAME) {
  console.error("❌ Critical environment variables missing. Please check your .env file:");
  if (!process.env.BOT_TOKEN) console.error(" - BOT_TOKEN is missing.");
  if (!process.env.MONGO_URI) console.error(" - MONGO_URI is missing.");
  if (!process.env.CHANNEL_USERNAME) console.error(" - CHANNEL_USERNAME is missing. This should be your verification channel's username (e.g., 'MyChannel') or numerical ID (e.g., '-1001234567890').");
  if (!process.env.BOT_USERNAME) console.error(" - BOT_USERNAME is missing (your bot's @username, e.g., 'YourReferralBot').");
  process.exit(1); // Exit if essential variables are not set
}

// Admin IDs should ideally be an array of numbers
let adminIds = [];
if (process.env.ADMIN_IDS) {
  adminIds = process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
  if (adminIds.length === 0) {
    console.warn("⚠️ ADMIN_IDS found in .env, but none are valid numbers. Admin commands might not work.");
  }
} else {
  console.warn("⚠️ No ADMIN_IDS found in .env. Admin commands will not work. Please set ADMIN_IDS as a comma-separated list of Telegram user IDs.");
}


const TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGO_URI;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME; // This variable will be used for verification channel
const BOT_USERNAME = process.env.BOT_USERNAME; // This is used for generating referral links

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(TOKEN, { polling: true });

// --- MongoDB Connection ---
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected successfully.'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1); // Exit if DB connection fails
  });

// --- Register Bot Commands ---
// Pass the bot instance and necessary configurations to command handlers
registerAdminCommands(bot, adminIds); // Pass the parsed adminIds array
registerUserCommands(bot, CHANNEL_USERNAME); // Pass CHANNEL_USERNAME for user commands verification

// --- Global Error Handling for Bot ---
bot.on('polling_error', (error) => {
  console.error("Polling error:", error.code, error.message);
  // Implement more specific error handling or logging
});

bot.on('webhook_error', (error) => {
  console.error("Webhook error:", error.code, error.message);
});

bot.on('error', (error) => {
  console.error("General bot error:", error.message);
});


// --- Express Server Setup (for API if needed, e.g., webhooks or external integrations) ---
const PORT = process.env.PORT || 3000;
expressApp.listen(PORT, () => {
  console.log(`🌐 Express API server running on port ${PORT}`);
});

console.log('🚀 Telegram bot started...');

// You can add a simple /status endpoint to your Express app for health checks
expressApp.get('/status', (req, res) => {
    res.status(200).json({
        bot: 'running',
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        uptime: process.uptime(),
    });
});
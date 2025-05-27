// app.js
const express = require('express');
const userRoutes = require('./routes/userRoutes');

const expressApp = express();
expressApp.use(express.json()); // Middleware to parse JSON request bodies

// Use your API routes for the Express application
expressApp.use('/api', userRoutes);

// Export the configured Express application instance.
module.exports = expressApp;
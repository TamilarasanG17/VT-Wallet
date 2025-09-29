const mongoose = require('mongoose');

// Define the schema for an Expense
const expenseSchema = new mongoose.Schema({
    userId: { // NEW: Link expense to a specific user
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Refers to the 'User' model
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true // Remove whitespace from both ends of a string
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01 // Ensure amount is positive
    },
    category: {
        type: String,
        required: true,
        enum: ['food', 'travel', 'entertainment', 'bills', 'shopping', 'other'] // Restrict to allowed categories
    },
    date: {
        type: Date,
        default: Date.now // Automatically set to current date if not provided
    },
    week: {
        type: String, // e.g., "Week 32 (2025)"
        required: true
    },
    month: {
        type: String, // e.g., "August"
        required: true
    },
    year: {
        type: Number, // e.g., 2025
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now // Timestamp for when the expense was created in DB
    }
});

// Create the Expense model from the schema
const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;

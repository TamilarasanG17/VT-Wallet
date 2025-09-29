// server.js
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs'); // For password hashing
const jwt = require('jsonwebtoken'); // For JSON Web Tokens
const nodemailer = require('nodemailer'); // For sending emails

const { Resend } = require('resend'); // Resend


const User = require('./models/User'); // Assuming you have a User model with otp, otpExpires, isVerified fields
const Expense = require('./models/Expanse'); // Assuming you have an Expense model

const app = express();
const PORT = process.env.PORT || 5000;


// Middleware
const allowedOrigin = 'https://vt-wallet.onrender.com';

app.use(cors({
    origin: allowedOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
})); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON request bodies
app.use(express.static(path.join(__dirname, "public"))); // Serve static files from the 'public' directory

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey'; // Fallback secret for JWT

mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully!'))
    .catch(err => console.error('MongoDB connection error:', err));

// // Nodemailer Transporter Setup
// const transporter = nodemailer.createTransport({
//     service: process.env.EMAIL_SERVICE || 'gmail', // e.g., 'gmail', 'SendGrid', 'Outlook365'
//     auth: {
//         user: process.env.EMAIL_USER, // Your email address from .env
//         pass: process.env.EMAIL_PASS  // Your email password or app-specific password from .env
//     }
// });


// Resend setup

const resend = new Resend(process.env.RESEND_API_KEY);

// --- Helper Functions ---

// Generate a 4-digit OTP
const generateOTP = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
};

// Send OTP via email
const sendOTP = async (email, otp, subject, htmlContent) => {
    try {
        const data = await resend.emails.send({
            from: 'onboarding@resend.dev', // ⚠️ Replace with your verified domain email
            to: email,
            subject,
            html: htmlContent,
        });
        console.log(`✅ OTP Email sent to ${email}: ${otp}`, data);
    } catch (error) {
        console.error(`❌ Error sending OTP email to ${email}:`, error);
        throw new Error('Failed to send verification email. Please try again.');
    }
};

// --- JWT Authentication Middleware ---
const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');
            if (!req.user) {
                return res.status(401).json({ message: 'User not found, token failed' });
            }
            next();
        } catch (error) {
            console.error('Not authorized, token failed:', error);
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }
    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

// --- API Routes ---

// 1. User Registration
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists with that email' });
        }

        const user = await User.create({ username, email, password, isVerified: false });

        const otp = generateOTP();
        const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save(); // Save OTP to user document

        await sendOTP(
            email,
            otp,
            'Expense Tracker Registration OTP',
            `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #4f46e5;">Account Registration OTP</h2>
                <p>Hello ${username},</p>
                <p>Thank you for registering with Expense Tracker. Please use the following One-Time Password (OTP) to verify your account:</p>
                <p>Your OTP is: <strong>${otp}</strong></p>
                <p>This code is valid for 10 minutes.</p>
                <p>If you did not register for this service, please ignore this email.</p>
                <p>Thank you,<br>Your Expense Tracker Team</p>
            </div>`
        );

        return res.status(201).json({
            message: 'Registration successful! Please verify your email with the OTP.',
            email,
            requiresOTP: true // Indicate to frontend that OTP verification is needed
        });
    } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({ message: 'Server error during registration', error: error.message });
    }
});

// 2. User Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const otp = generateOTP();
        const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save(); // Save OTP to user document

        await sendOTP(
            email,
            otp,
            'Expense Tracker Login Verification OTP',
            `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #4f46e5;">Login Verification OTP</h2>
                <p>Hello,</p>
                <p>You are attempting to log in to your Expense Tracker account. Please use the following One-Time Password (OTP) to complete your login:</p>
                <p>Your OTP is: <strong>${otp}</strong></p>
                <p>This code is valid for 10 minutes.</p>
                <p>If you did not attempt to log in, please ignore this email.</p>
                <p>Thank you,<br>Your Expense Tracker Team</p>
            </div>`
        );

        return res.status(200).json({
            message: 'Login successful! Please verify your identity with the OTP.',
            email,
            requiresOTP: true // Indicate to frontend that OTP verification is needed
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Server error during login', error: error.message });
    }
});

// 3. Forgot Password - Send OTP
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(200).json({ message: 'If your email exists, a verification code has been sent.' });
        }

        const otp = generateOTP();
        const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        await sendOTP(
            email,
            otp,
            'Expense Tracker Password Reset OTP',
            `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #4f46e5;">Password Reset Request</h2>
                <p>Hello,</p>
                <p>You have requested to reset your password for your Expense Tracker account.</p>
                <p>Your One-Time Password (OTP) is: <strong>${otp}</strong></p>
                <p>This code is valid for 10 minutes. If you did not request a password reset, please ignore this email.</p>
                <p>Thank you,<br>Your Expense Tracker Team</p>
            </div>`
        );

        return res.status(200).json({ message: 'A verification code has been sent to your email.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        return res.status(500).json({ message: 'Server error during forgot password', error: error.message });
    }
});

// 4. Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
    const { email, otp, purpose } = req.body; // 'purpose' is a new field from frontend
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found.' });
        }

        if (user.otp !== otp || user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP.' });
        }

        // Clear OTP fields after successful verification
        user.otp = null;
        user.otpExpires = null;
        await user.save();

        if (purpose === 'forgotPassword') {
            // OTP is valid for password reset, issue a temporary reset token
            const resetToken = jwt.sign({ id: user._id, type: 'passwordReset' }, JWT_SECRET, { expiresIn: '10m' });
            return res.status(200).json({ message: 'OTP verified successfully.', token: resetToken });
        } else if (purpose === 'register' || purpose === 'login') {
            // OTP is valid for registration or login, issue standard JWT
            if (!user.isVerified) {
                user.isVerified = true; // Mark user as verified after first successful OTP
                await user.save();
            }
            const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
            return res.status(200).json({ message: 'OTP verified successfully! Redirecting...', token });
        } else {
            return res.status(400).json({ message: 'Invalid OTP purpose.' });
        }

    } catch (error) {
        console.error('OTP verification error:', error);
        return res.status(500).json({ message: 'Server error during OTP verification', error: error.message });
    }
});

// 5. Reset Password (using the resetToken obtained from OTP verification)
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, newPassword, token } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findOne({ email });

        if (!user || decoded.type !== 'passwordReset' || decoded.id !== user._id.toString()) {
            return res.status(401).json({ message: 'Invalid or expired reset token.' });
        }

        user.password = newPassword; // Pre-save hook will hash it
        await user.save();

        return res.status(200).json({ message: 'Password updated successfully.' });
    } catch (error) {
        console.error('Reset password error:', error);
        return res.status(500).json({ message: 'Server error during password reset', error: error.message });
    }
});


// --- Expense Routes (Protected by 'protect' middleware) ---

// Route to add a new expense
app.post('/api/expenses', protect, async (req, res) => {
    try {
        // Ensure that the request body has the correct data for the Mongoose model
        const { name, amount, category, date, week, month, year } = req.body;

        // Create a new expense with the authenticated user's ID
        const newExpense = new Expense({
            userId: req.user._id, // Use userId to match your Mongoose model
            name,
            amount,
            category,
            date,
            week,
            month,
            year
        });
        const savedExpense = await newExpense.save();
        return res.status(201).json(savedExpense);
    } catch (error) {
        console.error('Error adding expense:', error);
        // Respond with a more specific error message if the Mongoose validation fails
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', errors: error.errors });
        }
        return res.status(500).json({ message: 'Server error during expense creation', error: error.message });
    }
});

// Route to get all expenses for the authenticated user
app.get('/api/expenses', protect, async (req, res) => {
    try {
        const expenses = await Expense.find({ userId: req.user._id }).sort({ date: -1, createdAt: -1 }); // Use userId to match your model
        return res.status(200).json(expenses);
    } catch (error) {
        console.error('Error fetching expenses:', error);
        return res.status(500).json({ message: 'Error fetching expenses', error: error.message });
    }
});

// Route to delete an expense by ID
app.delete('/api/expenses/:id', protect, async (req, res) => {
    try {
        const { id } = req.params;
        const deletedExpense = await Expense.findOneAndDelete({ _id: id, userId: req.user._id }); // Use userId to match your model
        if (!deletedExpense) {
            return res.status(404).json({ message: 'Expense not found or you do not have permission to delete it' });
        }
        return res.status(200).json({ message: 'Expense deleted successfully', deletedExpense });
    } catch (error) {
        console.error('Error deleting expense:', error);
        return res.status(500).json({ message: 'Error deleting expense', error: error.message });
    }
});

// --- Advanced Expense Reporting Routes (Protected) ---

// Route to get daily expenses (last 7 days) for the authenticated user
app.get('/api/expenses/daily', protect, async (req, res) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const dailyExpenses = await Expense.find({
            userId: req.user._id, // Use userId to match your model
            date: { $gte: sevenDaysAgo }
        }).sort({ date: -1, createdAt: -1 });
        return res.status(200).json(dailyExpenses);
    } catch (error) {
        console.error('Error fetching daily expenses:', error);
        return res.status(500).json({ message: 'Error fetching daily expenses', error: error.message });
    }
});

// Route to get current week expenses for the authenticated user
app.get('/api/expenses/weekly', protect, async (req, res) => {
    try {
        const today = new Date();
        const currentYear = today.getFullYear();
        const getWeek = (date) => {
            const d = new Date(date.getTime());
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
            const week1 = new Date(d.getFullYear(), 0, 4);
            return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
        };
        const currentWeekIdentifier = `Week ${getWeek(today)} (${currentYear})`;

        const weeklyExpenses = await Expense.find({
            userId: req.user._id, // Use userId to match your model
            week: currentWeekIdentifier
        }).sort({ date: -1, createdAt: -1 });
        return res.status(200).json(weeklyExpenses);
    } catch (error) {
        console.error('Error fetching weekly expenses:', error);
        return res.status(500).json({ message: 'Error fetching weekly expenses', error: error.message });
    }
});

// Route to get current month expenses for the authenticated user
app.get('/api/expenses/monthly', protect, async (req, res) => {
    try {
        const today = new Date();
        const currentMonthName = today.toLocaleString('default', { month: 'long' });
        const currentYear = today.getFullYear();

        const monthlyExpenses = await Expense.find({
            userId: req.user._id, // Use userId to match your model
            month: currentMonthName,
            year: currentYear
        }).sort({ date: -1, createdAt: -1 });
        return res.status(200).json(monthlyExpenses);
    } catch (error) {
        console.error('Error fetching monthly expenses:', error);
        return res.status(500).json({ message: 'Error fetching monthly expenses', error: error.message });
    }
});

// Route for category-wise expenses (current month) for the authenticated user
app.get('/api/expenses/category-summary', protect, async (req, res) => {
    try {
        const today = new Date();
        const currentMonthName = today.toLocaleString('default', { month: 'long' });
        const currentYear = today.getFullYear();

        const categorySummary = await Expense.aggregate([
            {
                $match: {
                    userId: req.user._id, // Use userId to match your model
                    month: currentMonthName,
                    year: currentYear
                }
            },
            {
                $group: {
                    _id: "$category",
                    totalSpent: { $sum: "$amount" }
                }
            },
            {
                $project: {
                    _id: 0,
                    category: "$_id",
                    totalSpent: 1
                }
            },
            {
                $sort: { totalSpent: -1 }
            }
        ]);

        const overallTotal = categorySummary.reduce((sum, item) => sum + item.totalSpent, 0);

        const summaryWithPercentage = categorySummary.map(item => ({
            ...item,
            percentage: overallTotal > 0 ? ((item.totalSpent / overallTotal) * 100).toFixed(2) : 0
        }));

        return res.status(200).json(summaryWithPercentage);
    } catch (error) {
        console.error('Error fetching category summary:', error);
        return res.status(500).json({ message: 'Error fetching category summary', error: error.message });
    }
});

// Route for top spending items (current month) for the authenticated user
app.get('/api/expenses/top-spending', protect, async (req, res) => {
    try {
        const today = new Date();
        const currentMonthName = today.toLocaleString('default', { month: 'long' });
        const currentYear = today.getFullYear();

        const topSpending = await Expense.find({
            userId: req.user._id, // Use userId to match your model
            month: currentMonthName,
            year: currentYear
        })
        .sort({ amount: -1 })
        .limit(10);

        return res.status(200).json(topSpending);
    } catch (error) {
        console.error('Error fetching top spending items:', error);
        return res.status(500).json({ message: 'Error fetching top spending items', error: error.message });
    }
});

// Route for historical weekly data for the authenticated user
app.get('/api/history/weekly', protect, async (req, res) => {
    try {
        const weeklyHistory = await Expense.aggregate([
            {
                $match: { userId: req.user._id } // Use userId to match your model
            },
            {
                $group: {
                    _id: "$week",
                    expenses: { $push: "$$ROOT" },
                    totalSpent: { $sum: "$amount" }
                }
            },
            {
                $project: {
                    _id: 0,
                    weekId: "$_id",
                    totalSpent: 1,
                    expenses: {
                        $map: {
                            input: "$expenses",
                            as: "exp",
                            in: {
                                id: "$$exp._id",
                                name: "$$exp.name",
                                amount: "$$exp.amount",
                                category: "$$exp.category",
                                date: "$$exp.date"
                            }
                        }
                    }
                }
            },
            {
                $sort: { weekId: -1 }
            }
        ]);
        return res.status(200).json(weeklyHistory);
    } catch (error) {
        console.error('Error fetching weekly history:', error);
        return res.status(500).json({ message: 'Error fetching weekly history', error: error.message });
    }
});

// Route for historical monthly data for the authenticated user
app.get('/api/history/monthly', protect, async (req, res) => {
    try {
        const monthlyHistory = await Expense.aggregate([
            {
                $match: { userId: req.user._id } // Use userId to match your model
            },
            {
                $group: {
                    _id: { month: "$month", year: "$year" },
                    expenses: { $push: "$$ROOT" },
                    totalSpent: { $sum: "$amount" }
                }
            },
            {
                $project: {
                    _id: 0,
                    monthId: { $concat: ["$_id.month", " ", { $toString: "$_id.year" }] },
                    totalSpent: 1,
                    expenses: {
                        $map: {
                            input: "$expenses",
                            as: "exp",
                            in: {
                                id: "$$exp._id",
                                name: "$$exp.name",
                                amount: "$$exp.amount",
                                category: "$$exp.category",
                                date: "$$exp.date"
                            }
                        }
                    }
                }
            },
            {
                $sort: { "_id.year": -1, "_id.month": -1 }
            }
        ]);
        return res.status(200).json(monthlyHistory);
    } catch (error) {
        console.error('Error fetching monthly history:', error);
        return res.status(500).json({ message: 'Error fetching monthly history', error: error.message });
    }
});

// Route to delete historical period (weekly or monthly) for the authenticated user
app.delete('/api/history/:type/:id', protect, async (req, res) => {
    try {
        const { type, id } = req.params;
        let deleteQuery = { userId: req.user._id }; // Use userId to match your model

        if (type === 'weekly') {
            deleteQuery.week = id;
        } else if (type === 'monthly') {
            const [monthName, year] = id.split(' ');
            deleteQuery.month = monthName;
            deleteQuery.year = parseInt(year);
        } else {
            return res.status(400).json({ message: 'Invalid history type specified.' });
        }

        const deleteResult = await Expense.deleteMany(deleteQuery);

        if (deleteResult.deletedCount === 0) {
            return res.status(404).json({ message: `No expenses found for ${type} ID: ${id} for this user.` });
        }
        return res.status(200).json({ message: `${deleteResult.deletedCount} expenses deleted for ${type} ID: ${id}` });

    } catch (error) {
        console.error('Error deleting historical period:', error);
        return res.status(500).json({ message: 'Error deleting historical period', error: error.message });
    }
});

// Serve the single index.html file for all frontend routes
// app.get(['/', '/login', '/otp-verify', '/forgot-password', '/update-password', '/expanse'], (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

app.get('/expanse.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Expanse.html'));
});

app.get( '*',(req,res) =>{
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
})


// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access the application at: http://localhost:${PORT}`);
});

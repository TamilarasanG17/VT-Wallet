const express = require("express");
const router = express.Router();
const Expense = require("../models/Expanse");

router.post("/", async (req, res) => {
  try {
    const expense = new Expense(req.body);
    await expense.save();
    res.status(201).json({ message: "Expense saved" });
  } catch (err) {
    res.status(500).json({ error: "Failed to save expense" });
  }
});

// Clean and get last 7 days
router.get("/daily", async (req, res) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Delete old entries
  await Expense.deleteMany({ date: { $lt: sevenDaysAgo } });

  // Get sorted latest
  const expenses = await Expense.find({ date: { $gte: sevenDaysAgo } }).sort({ date: -1 });
  res.json(expenses);
});

// Get current week
router.get("/weekly", async (req, res) => {
  const now = new Date();
  const currentWeek = getWeekNumber(now);
  const currentYear = now.getFullYear();

  // Delete old weeks
  await Expense.deleteMany({ week: { $lt: currentWeek }, year: currentYear });

  const expenses = await Expense.find({ week: currentWeek, year: currentYear }).sort({ date: -1 });
  res.json(expenses);
});

// Get current month
router.get("/monthly", async (req, res) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const expenses = await Expense.find({ month: currentMonth, year: currentYear }).sort({ date: -1 });
  res.json(expenses);
});

// Utility to calculate week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
module.exports = router;

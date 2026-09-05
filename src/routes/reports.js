const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/reports/summary - dashboard snapshot
router.get('/summary', async (req, res) => {
  try {
    // Washes and revenue today
    const todayResult = await pool.query(
      `SELECT COUNT(*) AS washes_today, COALESCE(SUM(price_charged), 0) AS revenue_today
       FROM wash_transactions
       WHERE created_at >= CURRENT_DATE`
    );

    // Washes and revenue this week (last 7 days)
    const weekResult = await pool.query(
      `SELECT COUNT(*) AS washes_this_week, COALESCE(SUM(price_charged), 0) AS revenue_this_week
       FROM wash_transactions
       WHERE created_at >= NOW() - INTERVAL '7 days'`
    );

    // Washes per employee, this week, ranked highest first
    const employeeResult = await pool.query(
      `SELECT e.id, e.name, COUNT(wt.id) AS washes_this_week
       FROM employees e
       LEFT JOIN wash_transactions wt
         ON wt.employee_id = e.id AND wt.created_at >= NOW() - INTERVAL '7 days'
       GROUP BY e.id, e.name
       ORDER BY washes_this_week DESC`
    );

    // How many distinct customers have washed more than once (a basic repeat-rate signal)
    const repeatResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE total_visits >= 2) AS repeat_customers,
         COUNT(*) AS total_customers
       FROM customers`
    );

    res.json({
      washes_today: parseInt(todayResult.rows[0].washes_today),
      revenue_today: parseFloat(todayResult.rows[0].revenue_today),
      washes_this_week: parseInt(weekResult.rows[0].washes_this_week),
      revenue_this_week: parseFloat(weekResult.rows[0].revenue_this_week),
      employees_this_week: employeeResult.rows.map(r => ({
        id: r.id,
        name: r.name,
        washes_this_week: parseInt(r.washes_this_week)
      })),
      repeat_customers: parseInt(repeatResult.rows[0].repeat_customers),
      total_customers: parseInt(repeatResult.rows[0].total_customers)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch report summary' });
  }
});

module.exports = router;

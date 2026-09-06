const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/employees/active - any logged-in employee can see this (id + name only)
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name FROM employees WHERE active = true ORDER BY name ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /api/employees/performance - admin only: washes and revenue per employee
router.get('/performance', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id,
        e.name,
        e.role,
        e.active,
        COUNT(wt.id) AS total_washes,
        COALESCE(SUM(wt.price_charged), 0) AS total_revenue,
        COUNT(wt.id) FILTER (WHERE wt.created_at >= CURRENT_DATE) AS washes_today,
        COUNT(wt.id) FILTER (WHERE wt.created_at >= NOW() - INTERVAL '7 days') AS washes_this_week,
        COALESCE(SUM(wt.price_charged) FILTER (WHERE wt.created_at >= NOW() - INTERVAL '7 days'), 0) AS revenue_this_week
      FROM employees e
      LEFT JOIN wash_transactions wt ON wt.employee_id = e.id
      GROUP BY e.id, e.name, e.role, e.active
      ORDER BY total_washes DESC
    `);

    const employees = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      active: row.active,
      total_washes: parseInt(row.total_washes),
      total_revenue: parseFloat(row.total_revenue),
      washes_today: parseInt(row.washes_today),
      washes_this_week: parseInt(row.washes_this_week),
      revenue_this_week: parseFloat(row.revenue_this_week),
    }));

    res.json(employees);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch employee performance' });
  }
});

// GET /api/employees - admin only, full list
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, role, active, created_at FROM employees ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

module.exports = router;

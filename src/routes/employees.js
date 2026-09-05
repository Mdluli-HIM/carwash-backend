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

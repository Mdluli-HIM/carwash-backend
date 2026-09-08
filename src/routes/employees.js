const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/employees/active - names for the "washed by" dropdown
// Only returns named attendants (no login), not login-capable accounts
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name FROM employees WHERE active = true AND email IS NULL ORDER BY name ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// POST /api/employees - admin only, add a named attendant (no login)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const result = await pool.query(
      `INSERT INTO employees (name, phone, role, active)
       VALUES ($1, $2, 'attendant', true)
       RETURNING id, name, phone, role, active`,
      [name, phone || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add attendant' });
  }
});

// PATCH /api/employees/:id - admin only, edit name/phone or toggle active
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, active } = req.body;
    const result = await pool.query(
      `UPDATE employees
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           active = COALESCE($3, active)
       WHERE id = $4 AND email IS NULL
       RETURNING id, name, phone, role, active`,
      [name, phone, active, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendant not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update attendant' });
  }
});

// GET /api/employees - admin only, full list including login accounts
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

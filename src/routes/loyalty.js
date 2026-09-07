const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/loyalty-rules - admin only, list all rules
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM loyalty_rules ORDER BY created_at DESC NULLS LAST, id DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch loyalty rules' });
  }
});

// POST /api/loyalty-rules - admin only, create a new rule
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, threshold, window_days, discount_percent } = req.body;

    if (!name || !threshold || !window_days || discount_percent === undefined) {
      return res.status(400).json({
        error: 'name, threshold, window_days, and discount_percent are all required'
      });
    }

    const result = await pool.query(
      `INSERT INTO loyalty_rules (name, type, threshold, window_days, discount_percent)
       VALUES ($1, 'frequency_window', $2, $3, $4)
       RETURNING *`,
      [name, threshold, window_days, discount_percent]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create loyalty rule' });
  }
});

// PATCH /api/loyalty-rules/:id - admin only, update or toggle a rule
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, threshold, window_days, discount_percent, active } = req.body;

    const result = await pool.query(
      `UPDATE loyalty_rules
       SET name = COALESCE($1, name),
           threshold = COALESCE($2, threshold),
           window_days = COALESCE($3, window_days),
           discount_percent = COALESCE($4, discount_percent),
           active = COALESCE($5, active)
       WHERE id = $6
       RETURNING *`,
      [name, threshold, window_days, discount_percent, active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update loyalty rule' });
  }
});

module.exports = router;

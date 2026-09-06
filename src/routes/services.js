const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/services - list active services (any logged-in employee)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, price, active FROM services WHERE active = true ORDER BY price ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// GET /api/services/all - admin only, includes inactive services too
router.get('/all', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, price, active FROM services ORDER BY price ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// POST /api/services - admin only, create a new service
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, price } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'name and price are required' });
    }
    const result = await pool.query(
      'INSERT INTO services (name, price) VALUES ($1, $2) RETURNING *',
      [name, price]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// PATCH /api/services/:id - admin only, update name, price, or active status
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, active } = req.body;

    const result = await pool.query(
      `UPDATE services
       SET name = COALESCE($1, name),
           price = COALESCE($2, price),
           active = COALESCE($3, active)
       WHERE id = $4
       RETURNING *`,
      [name, price, active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

module.exports = router;

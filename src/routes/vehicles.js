const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/vehicles?customer_id=1 - list vehicles, optionally filtered by customer
router.get('/', async (req, res) => {
  try {
    const { customer_id } = req.query;
    let result;
    if (customer_id) {
      result = await pool.query(
        'SELECT * FROM vehicles WHERE customer_id = $1 ORDER BY created_at DESC',
        [customer_id]
      );
    } else {
      result = await pool.query('SELECT * FROM vehicles ORDER BY created_at DESC');
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

// POST /api/vehicles - add a vehicle to a customer
router.post('/', async (req, res) => {
  try {
    const { customer_id, make, model, color, plate } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }

    const result = await pool.query(
      'INSERT INTO vehicles (customer_id, make, model, color, plate) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [customer_id, make || null, model || null, color || null, plate || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      // foreign_key_violation - customer_id doesn't exist
      return res.status(400).json({ error: 'No customer exists with that customer_id' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
});

module.exports = router;

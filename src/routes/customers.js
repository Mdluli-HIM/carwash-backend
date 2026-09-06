const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/customers - list all customers, optionally search by phone or name
router.get('/', async (req, res) => {
  try {
    const { phone, search } = req.query;
    let result;

    if (search) {
      result = await pool.query(
        'SELECT * FROM customers WHERE name ILIKE $1 OR phone ILIKE $1 ORDER BY created_at DESC',
        ['%' + search + '%']
      );
    } else if (phone) {
      result = await pool.query(
        'SELECT * FROM customers WHERE phone ILIKE $1 ORDER BY created_at DESC',
        ['%' + phone + '%']
      );
    } else {
      result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// POST /api/customers - create a new customer
router.post('/', async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const result = await pool.query(
      'INSERT INTO customers (name, phone, email) VALUES ($1, $2, $3) RETURNING *',
      [name, phone, email || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A customer with this phone number already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

module.exports = router;

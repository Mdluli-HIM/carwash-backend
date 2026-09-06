const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/customers - list all customers, optionally search by phone or name
router.get('/', async (req, res) => {
  try {
    const { phone, search } = req.query;
    let query = `
      SELECT c.*, COUNT(v.id) AS vehicle_count
      FROM customers c
      LEFT JOIN vehicles v ON v.customer_id = c.id
    `;
    const params = [];

    if (search) {
      params.push('%' + search + '%');
      query += ' WHERE c.name ILIKE $1 OR c.phone ILIKE $1';
    } else if (phone) {
      params.push('%' + phone + '%');
      query += ' WHERE c.phone ILIKE $1';
    }

    query += ' GROUP BY c.id ORDER BY c.total_visits DESC, c.created_at DESC';

    const result = await pool.query(query, params);
    const customers = result.rows.map((row) => ({
      ...row,
      vehicle_count: parseInt(row.vehicle_count),
    }));

    res.json(customers);
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

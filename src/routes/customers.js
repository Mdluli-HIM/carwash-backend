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

// GET /api/customers/:id - full profile: customer info, vehicles, and wash history
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const customerResult = await pool.query(
      'SELECT * FROM customers WHERE id = $1',
      [id]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const vehiclesResult = await pool.query(
      'SELECT * FROM vehicles WHERE customer_id = $1 ORDER BY created_at DESC',
      [id]
    );

    const washesResult = await pool.query(
      `SELECT
        wt.id, wt.price_charged, wt.discount_percent, wt.discount_reason, wt.created_at,
        v.make AS vehicle_make, v.model AS vehicle_model, v.plate AS vehicle_plate,
        e.name AS employee_name,
        s.name AS service_name
       FROM wash_transactions wt
       JOIN vehicles v ON v.id = wt.vehicle_id
       JOIN employees e ON e.id = wt.employee_id
       JOIN services s ON s.id = wt.service_id
       WHERE wt.customer_id = $1
       ORDER BY wt.created_at DESC`,
      [id]
    );

    const totalSpent = washesResult.rows.reduce(
      (sum, w) => sum + parseFloat(w.price_charged),
      0
    );

    res.json({
      customer: customerResult.rows[0],
      vehicles: vehiclesResult.rows,
      washes: washesResult.rows,
      total_spent: totalSpent,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customer detail' });
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

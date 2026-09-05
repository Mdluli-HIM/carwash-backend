const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/services - list active services
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, price FROM services WHERE active = true ORDER BY price ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

module.exports = router;

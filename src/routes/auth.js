const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// POST /api/auth/register - admin-only: create a new employee account
router.post('/register', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO employees (name, email, password_hash, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, phone, role, created_at`,
      [name, email, passwordHash, phone || null, role || 'attendant']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An employee with this email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to register employee' });
  }
});

// POST /api/auth/login - public: verify credentials, return a token
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const result = await pool.query(
      'SELECT * FROM employees WHERE email = $1 AND active = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const employee = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, employee.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: employee.id, role: employee.role, name: employee.name },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      employee: { id: employee.id, name: employee.name, email: employee.email, role: employee.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

module.exports = router;

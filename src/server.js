const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./config/db');
const customerRoutes = require('./routes/customers');
const vehicleRoutes = require('./routes/vehicles');
const washRoutes = require('./routes/washes');
const reportRoutes = require('./routes/reports');
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const serviceRoutes = require('./routes/services');
const { requireAuth, requireAdmin } = require('./middleware/auth');

const app = express();

const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
};
app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/auth', authRoutes);

app.use('/api/customers', requireAuth, customerRoutes);
app.use('/api/vehicles', requireAuth, vehicleRoutes);
app.use('/api/washes', requireAuth, washRoutes);
app.use('/api/services', requireAuth, serviceRoutes);
app.use('/api/employees', requireAuth, employeeRoutes);
app.use('/api/reports', requireAuth, requireAdmin, reportRoutes);

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', dbTime: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

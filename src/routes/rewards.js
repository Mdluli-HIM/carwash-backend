const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/rewards?phone=... - PUBLIC, no login required
// Returns a customer's current wash status (if any) and progress toward every active loyalty rule
router.get('/', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const customerResult = await pool.query(
      'SELECT id, name, phone, total_visits FROM customers WHERE phone = $1',
      [phone]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'No customer found with that phone number' });
    }
    const customer = customerResult.rows[0];

    const activeWashResult = await pool.query(
      `SELECT wt.id, wt.status, wt.created_at,
        v.make AS vehicle_make, v.model AS vehicle_model, v.plate AS vehicle_plate,
        s.name AS service_name
       FROM wash_transactions wt
       JOIN vehicles v ON v.id = wt.vehicle_id
       JOIN services s ON s.id = wt.service_id
       WHERE wt.customer_id = $1 AND wt.status != 'done'
       ORDER BY wt.created_at DESC
       LIMIT 1`,
      [customer.id]
    );
    const activeWash = activeWashResult.rows[0] || null;

    const rulesResult = await pool.query(
      'SELECT * FROM loyalty_rules WHERE active = true ORDER BY discount_percent DESC'
    );

    const progress = [];
    for (const rule of rulesResult.rows) {
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM wash_transactions wt
         WHERE wt.customer_id = $1
         AND wt.created_at >= NOW() - ($2 || ' days')::interval
         AND wt.created_at > COALESCE(
           (SELECT MAX(lr.redeemed_at) FROM loyalty_redemptions lr
            WHERE lr.customer_id = $1 AND lr.rule_id = $3),
           '1970-01-01'::timestamp
         )`,
        [customer.id, rule.window_days, rule.id]
      );
      const visitsInWindow = parseInt(countResult.rows[0].count);
      const remaining = Math.max(0, rule.threshold - visitsInWindow);

      progress.push({
        rule_name: rule.name,
        threshold: rule.threshold,
        window_days: rule.window_days,
        discount_percent: parseFloat(rule.discount_percent),
        visits_in_window: visitsInWindow,
        remaining,
        eligible_now: remaining === 0,
      });
    }

    res.json({
      customer: {
        name: customer.name,
        total_visits: customer.total_visits,
      },
      active_wash: activeWash,
      progress,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch rewards status' });
  }
});

module.exports = router;

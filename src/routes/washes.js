const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// POST /api/washes - log a wash, auto-apply loyalty discount if earned
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, vehicle_id, employee_id, service_id } = req.body;

    if (!customer_id || !vehicle_id || !employee_id || !service_id) {
      return res.status(400).json({
        error: 'customer_id, vehicle_id, employee_id, and service_id are all required'
      });
    }

    await client.query('BEGIN');

    // 1. Get the service price
    const serviceResult = await client.query(
      'SELECT price FROM services WHERE id = $1 AND active = true',
      [service_id]
    );
    if (serviceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Service not found or inactive' });
    }
    const basePrice = parseFloat(serviceResult.rows[0].price);

    // 2. Check active loyalty rules for a discount this customer may have earned
    let discountPercent = 0;
    let discountReason = null;
    let earnedRule = null;

    const rulesResult = await client.query(
      'SELECT * FROM loyalty_rules WHERE active = true'
    );

    for (const rule of rulesResult.rows) {
      if (rule.type === 'frequency_window') {
        // Count washes since this customer's last redemption of THIS rule,
        // within the rule's window (e.g. last 60 days)
        const countResult = await client.query(
          `SELECT COUNT(*) FROM wash_transactions wt
           WHERE wt.customer_id = $1
           AND wt.created_at >= NOW() - ($2 || ' days')::interval
           AND wt.created_at > COALESCE(
             (SELECT MAX(lr.redeemed_at) FROM loyalty_redemptions lr
              WHERE lr.customer_id = $1 AND lr.rule_id = $3),
             '1970-01-01'::timestamp
           )`,
          [customer_id, rule.window_days, rule.id]
        );
        const visitsInWindow = parseInt(countResult.rows[0].count);

        // This new wash would be visitsInWindow + 1 -- if that hits the threshold, reward it
        if (visitsInWindow + 1 >= rule.threshold) {
          discountPercent = parseFloat(rule.discount_percent);
          discountReason = rule.name;
          earnedRule = rule;
          break; // first matching rule wins for MVP simplicity
        }
      }
      // visit_milestone rule type can be added the same way later if needed
    }

    const finalPrice = basePrice - (basePrice * discountPercent / 100);

    // 3. Insert the wash transaction
    const washResult = await client.query(
      `INSERT INTO wash_transactions
        (customer_id, vehicle_id, employee_id, service_id, price_charged, discount_percent, discount_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [customer_id, vehicle_id, employee_id, service_id, finalPrice, discountPercent, discountReason]
    );
    const wash = washResult.rows[0];

    // 4. If a discount was earned, log the redemption
    if (earnedRule) {
      await client.query(
        `INSERT INTO loyalty_redemptions (customer_id, rule_id, wash_transaction_id)
         VALUES ($1, $2, $3)`,
        [customer_id, earnedRule.id, wash.id]
      );
    }

    // 5. Bump the customer's total visit count
    await client.query(
      'UPDATE customers SET total_visits = total_visits + 1 WHERE id = $1',
      [customer_id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      wash,
      discount_applied: discountPercent > 0,
      discount_percent: discountPercent,
      discount_reason: discountReason,
      base_price: basePrice,
      final_price: finalPrice
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to log wash' });
  } finally {
    client.release();
  }
});

// GET /api/washes - list all washes, optionally filtered by customer
router.get('/', async (req, res) => {
  try {
    const { customer_id } = req.query;
    let result;
    if (customer_id) {
      result = await pool.query(
        `SELECT wt.*, c.name AS customer_name, e.name AS employee_name, s.name AS service_name
         FROM wash_transactions wt
         JOIN customers c ON c.id = wt.customer_id
         JOIN employees e ON e.id = wt.employee_id
         JOIN services s ON s.id = wt.service_id
         WHERE wt.customer_id = $1
         ORDER BY wt.created_at DESC`,
        [customer_id]
      );
    } else {
      result = await pool.query(
        `SELECT wt.*, c.name AS customer_name, e.name AS employee_name, s.name AS service_name
         FROM wash_transactions wt
         JOIN customers c ON c.id = wt.customer_id
         JOIN employees e ON e.id = wt.employee_id
         JOIN services s ON s.id = wt.service_id
         ORDER BY wt.created_at DESC`
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch washes' });
  }
});

module.exports = router;

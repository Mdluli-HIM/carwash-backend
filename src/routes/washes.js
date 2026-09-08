const express = require('express');
const router = express.Router();
const pool = require('../config/db');

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

    const serviceResult = await client.query(
      'SELECT price FROM services WHERE id = $1 AND active = true',
      [service_id]
    );
    if (serviceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Service not found or inactive' });
    }
    const basePrice = parseFloat(serviceResult.rows[0].price);

    let discountPercent = 0;
    let discountReason = null;
    let earnedRule = null;

    const rulesResult = await client.query(
      'SELECT * FROM loyalty_rules WHERE active = true'
    );

    for (const rule of rulesResult.rows) {
      if (rule.type === 'frequency_window') {
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
        if (visitsInWindow + 1 >= rule.threshold) {
          const ruleDiscount = parseFloat(rule.discount_percent);
          if (ruleDiscount > discountPercent) {
            discountPercent = ruleDiscount;
            discountReason = rule.name;
            earnedRule = rule;
          }
        }
      }
    }

    const finalPrice = basePrice - (basePrice * discountPercent / 100);

    const washResult = await client.query(
      `INSERT INTO wash_transactions
        (customer_id, vehicle_id, employee_id, service_id, price_charged, discount_percent, discount_reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [customer_id, vehicle_id, employee_id, service_id, finalPrice, discountPercent, discountReason]
    );
    const wash = washResult.rows[0];

    if (earnedRule) {
      await client.query(
        `INSERT INTO loyalty_redemptions (customer_id, rule_id, wash_transaction_id)
         VALUES ($1, $2, $3)`,
        [customer_id, earnedRule.id, wash.id]
      );
    }

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

// PATCH /api/washes/:id/status - update a wash's status (pending -> washing -> done)
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'washing', 'done'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'status must be one of: pending, washing, done' });
    }

    const result = await pool.query(
      'UPDATE wash_transactions SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wash not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update wash status' });
  }
});

// GET /api/washes/active - all washes not yet done, for the attendant queue screen
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        wt.id, wt.status, wt.price_charged, wt.created_at,
        c.name AS customer_name, c.phone AS customer_phone,
        v.make AS vehicle_make, v.model AS vehicle_model, v.plate AS vehicle_plate,
        e.name AS employee_name,
        s.name AS service_name
       FROM wash_transactions wt
       JOIN customers c ON c.id = wt.customer_id
       JOIN vehicles v ON v.id = wt.vehicle_id
       JOIN employees e ON e.id = wt.employee_id
       JOIN services s ON s.id = wt.service_id
       WHERE wt.status != 'done'
       ORDER BY wt.created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch active washes' });
  }
});

// GET /api/washes - paginated transaction history with filters
router.get('/', async (req, res) => {
  try {
    const { employee_id, service_id, date_from, date_to, page, page_size } = req.query;
    const conditions = [];
    const params = [];

    if (employee_id) {
      params.push(employee_id);
      conditions.push('wt.employee_id = $' + params.length);
    }
    if (service_id) {
      params.push(service_id);
      conditions.push('wt.service_id = $' + params.length);
    }
    if (date_from) {
      params.push(date_from);
      conditions.push('wt.created_at >= $' + params.length);
    }
    if (date_to) {
      params.push(date_to + ' 23:59:59');
      conditions.push('wt.created_at <= $' + params.length);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const pageNum = page ? Math.max(1, parseInt(page)) : 1;
    const pageSize = page_size ? Math.min(100, parseInt(page_size)) : 20;
    const offset = (pageNum - 1) * pageSize;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM wash_transactions wt ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const dataParams = [...params, pageSize, offset];
    const result = await pool.query(
      `SELECT
        wt.id, wt.price_charged, wt.discount_percent, wt.discount_reason, wt.status, wt.created_at,
        c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone,
        v.make AS vehicle_make, v.model AS vehicle_model, v.plate AS vehicle_plate,
        e.id AS employee_id, e.name AS employee_name,
        s.id AS service_id, s.name AS service_name
       FROM wash_transactions wt
       JOIN customers c ON c.id = wt.customer_id
       JOIN vehicles v ON v.id = wt.vehicle_id
       JOIN employees e ON e.id = wt.employee_id
       JOIN services s ON s.id = wt.service_id
       ${whereClause}
       ORDER BY wt.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    res.json({
      washes: result.rows,
      page: pageNum,
      page_size: pageSize,
      total,
      total_pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch washes' });
  }
});

module.exports = router;

const express = require("express");

const { query } = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/error");

const router = express.Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const zoneId = req.query.zoneId || null;
    const from = req.query.from || null;
    const to = req.query.to || null;
    const status = req.query.status || null;
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const events = await query(
      `SELECT ie.id, ie.zone_id, z.name AS zone_name, ie.start_time, ie.end_time,
              ie.duration_minutes, ie.volume_liters, ie.status, ie.triggered_by
       FROM irrigation_events ie
       JOIN zones z ON z.id = ie.zone_id
       WHERE z.user_id = $1
         AND ($2::uuid IS NULL OR ie.zone_id = $2)
         AND ($3::timestamptz IS NULL OR ie.start_time >= $3)
         AND ($4::timestamptz IS NULL OR ie.start_time <= $4)
         AND ($5::text IS NULL OR ie.status = $5)
       ORDER BY ie.start_time DESC
       LIMIT $6 OFFSET $7`,
      [req.user.id, zoneId, from, to, status, limit, offset]
    );

    return res.status(200).json({
      count: events.rowCount,
      items: events.rows
    });
  })
);

module.exports = router;

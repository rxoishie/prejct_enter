const express = require("express");

const { query } = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/error");
const { validateBody } = require("../middleware/validate");
const { irrigationStartSchema, irrigationStopSchema } = require("../schemas/domain");

const router = express.Router();

router.post(
  "/:zoneId/start",
  requireAuth,
  validateBody(irrigationStartSchema),
  asyncHandler(async (req, res) => {
    const zoneCheck = await query(
      "SELECT id FROM zones WHERE id = $1 AND user_id = $2 LIMIT 1",
      [req.params.zoneId, req.user.id]
    );

    if (zoneCheck.rowCount === 0) {
      return res.status(404).json({ message: "Zone not found" });
    }

    const running = await query(
      "SELECT id FROM irrigation_events WHERE zone_id = $1 AND status = 'running' LIMIT 1",
      [req.params.zoneId]
    );

    if (running.rowCount > 0) {
      return res.status(409).json({ message: "Irrigation already running for this zone" });
    }

    const created = await query(
      `INSERT INTO irrigation_events
       (zone_id, start_time, status, triggered_by)
       VALUES ($1, NOW(), 'running', $2)
       RETURNING id, zone_id, start_time, status, triggered_by`,
      [req.params.zoneId, req.body.triggeredBy]
    );

    await query(
      "INSERT INTO notification_logs (user_id, event_type, message) VALUES ($1, $2, $3)",
      [req.user.id, "irrigation_started", `Irrigation démarrée pour la zone ${req.params.zoneId}`]
    );

    return res.status(201).json(created.rows[0]);
  })
);

router.post(
  "/:zoneId/stop",
  requireAuth,
  validateBody(irrigationStopSchema),
  asyncHandler(async (req, res) => {
    const running = await query(
      `SELECT ie.id, ie.start_time
       FROM irrigation_events ie
       JOIN zones z ON z.id = ie.zone_id
       WHERE ie.zone_id = $1 AND z.user_id = $2 AND ie.status = 'running'
       LIMIT 1`,
      [req.params.zoneId, req.user.id]
    );

    if (running.rowCount === 0) {
      return res.status(404).json({ message: "No running irrigation found for this zone" });
    }

    const current = running.rows[0];

    const stopped = await query(
      `UPDATE irrigation_events
       SET end_time = NOW(),
           duration_minutes = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NOW() - start_time)) / 60.0)),
           volume_liters = COALESCE($1, volume_liters, 0),
           status = $2
       WHERE id = $3
       RETURNING id, zone_id, start_time, end_time, duration_minutes, volume_liters, status, triggered_by`,
      [req.body.volumeLiters || null, req.body.status, current.id]
    );

    await query(
      "INSERT INTO notification_logs (user_id, event_type, message) VALUES ($1, $2, $3)",
      [req.user.id, "irrigation_stopped", `Irrigation arrêtée pour la zone ${req.params.zoneId}`]
    );

    return res.status(200).json(stopped.rows[0]);
  })
);

module.exports = router;

const express = require("express");

const env = require("../config/env");
const { query } = require("../db/pool");
const { asyncHandler } = require("../middleware/error");
const { validateBody } = require("../middleware/validate");
const { sensorIngestSchema } = require("../schemas/domain");

const router = express.Router();

router.post(
  "/ingest",
  validateBody(sensorIngestSchema),
  asyncHandler(async (req, res) => {
    const deviceKey = req.header("x-device-key");

    if (!deviceKey || deviceKey !== env.deviceSharedKey) {
      return res.status(401).json({ message: "Invalid device key" });
    }

    const zone = await query(
      "SELECT id, user_id, humidity_threshold_min FROM zones WHERE id = $1 LIMIT 1",
      [req.body.zoneId]
    );

    if (zone.rowCount === 0) {
      return res.status(404).json({ message: "Zone not found" });
    }

    const recordedAt = req.body.recordedAt || new Date().toISOString();

    const inserted = await query(
      `INSERT INTO sensor_readings
       (zone_id, humidity, temperature, valve_status, flow_rate, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, zone_id, humidity, temperature, valve_status, flow_rate, recorded_at`,
      [
        req.body.zoneId,
        req.body.humidity,
        req.body.temperature,
        req.body.valveStatus,
        req.body.flowRate || null,
        recordedAt
      ]
    );

    if (req.body.humidity < zone.rows[0].humidity_threshold_min) {
      await query(
        `INSERT INTO alerts (zone_id, alert_type, severity, resolved)
         VALUES ($1, 'humidity_low', 'warning', false)`,
        [req.body.zoneId]
      );

      await query(
        "INSERT INTO notification_logs (user_id, event_type, message) VALUES ($1, $2, $3)",
        [
          zone.rows[0].user_id,
          "humidity_low",
          `Alerte humidité basse détectée sur la zone ${req.body.zoneId}`
        ]
      );
    }

    return res.status(201).json(inserted.rows[0]);
  })
);

module.exports = router;

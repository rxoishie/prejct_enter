const express = require("express");

const { query } = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/error");
const { validateBody } = require("../middleware/validate");
const { zoneUpdateSchema } = require("../schemas/domain");

const router = express.Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const zones = await query(
      `SELECT
        z.id,
        z.name,
        z.mode,
        z.humidity_threshold_min,
        z.humidity_threshold_max,
        z.device_key,
        sr.humidity,
        sr.temperature,
        sr.valve_status,
        sr.recorded_at AS last_recorded_at
      FROM zones z
      LEFT JOIN LATERAL (
        SELECT humidity, temperature, valve_status, recorded_at
        FROM sensor_readings
        WHERE zone_id = z.id
        ORDER BY recorded_at DESC
        LIMIT 1
      ) sr ON TRUE
      WHERE z.user_id = $1
      ORDER BY z.created_at ASC`,
      [req.user.id]
    );

    return res.status(200).json(zones.rows);
  })
);

router.get(
  "/:zoneId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const zone = await query(
      `SELECT id, name, mode, humidity_threshold_min, humidity_threshold_max, device_key
       FROM zones
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [req.params.zoneId, req.user.id]
    );

    if (zone.rowCount === 0) {
      return res.status(404).json({ message: "Zone not found" });
    }

    const recent = await query(
      `SELECT humidity, temperature, valve_status, flow_rate, recorded_at
       FROM sensor_readings
       WHERE zone_id = $1
       ORDER BY recorded_at DESC
       LIMIT 24`,
      [req.params.zoneId]
    );

    return res.status(200).json({
      ...zone.rows[0],
      latestReadings: recent.rows
    });
  })
);

router.patch(
  "/:zoneId",
  requireAuth,
  validateBody(zoneUpdateSchema),
  asyncHandler(async (req, res) => {
    const updates = [];
    const values = [];
    let i = 1;

    const map = {
      name: "name",
      mode: "mode",
      humidityThresholdMin: "humidity_threshold_min",
      humidityThresholdMax: "humidity_threshold_max"
    };

    for (const [key, dbField] of Object.entries(map)) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates.push(`${dbField} = $${i}`);
        values.push(req.body[key]);
        i += 1;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No zone fields provided" });
    }

    values.push(req.params.zoneId);
    values.push(req.user.id);

    const updated = await query(
      `UPDATE zones
       SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = $${i} AND user_id = $${i + 1}
       RETURNING id, name, mode, humidity_threshold_min, humidity_threshold_max`,
      values
    );

    if (updated.rowCount === 0) {
      return res.status(404).json({ message: "Zone not found" });
    }

    return res.status(200).json(updated.rows[0]);
  })
);

module.exports = router;

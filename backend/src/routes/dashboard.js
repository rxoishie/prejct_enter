const express = require("express");

const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/error");
const { query } = require("../db/pool");

const router = express.Router();

router.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const [zones, running, water, alerts] = await Promise.all([
      query("SELECT COUNT(*)::int AS count FROM zones WHERE user_id = $1", [userId]),
      query(
        "SELECT COUNT(*)::int AS count FROM irrigation_events ie JOIN zones z ON z.id = ie.zone_id WHERE z.user_id = $1 AND ie.status = 'running'",
        [userId]
      ),
      query(
        "SELECT COALESCE(SUM(volume_liters), 0)::float AS total FROM irrigation_events ie JOIN zones z ON z.id = ie.zone_id WHERE z.user_id = $1 AND ie.start_time >= NOW() - INTERVAL '7 days'",
        [userId]
      ),
      query(
        "SELECT COUNT(*)::int AS count FROM alerts a JOIN zones z ON z.id = a.zone_id WHERE z.user_id = $1 AND a.resolved = false",
        [userId]
      )
    ]);

    res.status(200).json({
      activeZones: zones.rows[0].count,
      runningIrrigations: running.rows[0].count,
      waterUsedLast7Days: water.rows[0].total,
      activeAlerts: alerts.rows[0].count
    });
  })
);

module.exports = router;

const express = require("express");

const { query } = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/error");
const { validateBody } = require("../middleware/validate");
const { scheduleCreateSchema, scheduleUpdateSchema } = require("../schemas/domain");

const router = express.Router();

function computeNextRun(timeOfDay) {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT s.id, s.zone_id, s.name, s.time_of_day, s.recurrence, s.recurrence_meta, s.active, s.next_run_time
       FROM schedules s
       JOIN zones z ON z.id = s.zone_id
       WHERE z.user_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );

    return res.status(200).json(rows.rows);
  })
);

router.post(
  "/",
  requireAuth,
  validateBody(scheduleCreateSchema),
  asyncHandler(async (req, res) => {
    const zone = await query("SELECT id FROM zones WHERE id = $1 AND user_id = $2", [
      req.body.zoneId,
      req.user.id
    ]);

    if (zone.rowCount === 0) {
      return res.status(404).json({ message: "Zone not found" });
    }

    const nextRun = computeNextRun(req.body.timeOfDay);

    const created = await query(
      `INSERT INTO schedules
       (zone_id, name, time_of_day, recurrence, recurrence_meta, active, next_run_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, zone_id, name, time_of_day, recurrence, recurrence_meta, active, next_run_time`,
      [
        req.body.zoneId,
        req.body.name || null,
        req.body.timeOfDay,
        req.body.recurrence,
        req.body.recurrenceMeta || {},
        req.body.active,
        nextRun.toISOString()
      ]
    );

    return res.status(201).json(created.rows[0]);
  })
);

router.patch(
  "/:scheduleId",
  requireAuth,
  validateBody(scheduleUpdateSchema),
  asyncHandler(async (req, res) => {
    const updates = [];
    const values = [];
    let index = 1;

    const map = {
      name: "name",
      timeOfDay: "time_of_day",
      recurrence: "recurrence",
      recurrenceMeta: "recurrence_meta",
      active: "active"
    };

    for (const [key, dbField] of Object.entries(map)) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates.push(`${dbField} = $${index}`);
        values.push(req.body[key]);
        index += 1;
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "timeOfDay")) {
      updates.push(`next_run_time = $${index}`);
      values.push(computeNextRun(req.body.timeOfDay).toISOString());
      index += 1;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No schedule fields provided" });
    }

    values.push(req.params.scheduleId);
    values.push(req.user.id);

    const updated = await query(
      `UPDATE schedules s
       SET ${updates.join(", ")}, updated_at = NOW()
       FROM zones z
       WHERE s.id = $${index} AND s.zone_id = z.id AND z.user_id = $${index + 1}
       RETURNING s.id, s.zone_id, s.name, s.time_of_day, s.recurrence, s.recurrence_meta, s.active, s.next_run_time`,
      values
    );

    if (updated.rowCount === 0) {
      return res.status(404).json({ message: "Schedule not found" });
    }

    return res.status(200).json(updated.rows[0]);
  })
);

router.delete(
  "/:scheduleId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const deleted = await query(
      `DELETE FROM schedules s
       USING zones z
       WHERE s.id = $1 AND s.zone_id = z.id AND z.user_id = $2
       RETURNING s.id`,
      [req.params.scheduleId, req.user.id]
    );

    if (deleted.rowCount === 0) {
      return res.status(404).json({ message: "Schedule not found" });
    }

    return res.status(204).send();
  })
);

module.exports = router;

const express = require("express");

const { query } = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/error");

const router = express.Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT id, event_type, message, read, sent_at
       FROM notification_logs
       WHERE user_id = $1
       ORDER BY sent_at DESC
       LIMIT 100`,
      [req.user.id]
    );

    return res.status(200).json(rows.rows);
  })
);

router.patch(
  "/:notificationId/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const updated = await query(
      `UPDATE notification_logs
       SET read = true
       WHERE id = $1 AND user_id = $2
       RETURNING id, event_type, message, read, sent_at`,
      [req.params.notificationId, req.user.id]
    );

    if (updated.rowCount === 0) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json(updated.rows[0]);
  })
);

module.exports = router;

const express = require("express");
const bcrypt = require("bcryptjs");

const { query } = require("../db/pool");
const { asyncHandler } = require("../middleware/error");
const { validateBody } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  profileUpdateSchema
} = require("../schemas/auth");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} = require("../utils/jwt");

const router = express.Router();

function buildTokens(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    username: user.username
  };

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload)
  };
}

router.post(
  "/register",
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const {
      email,
      username,
      password,
      firstName,
      lastName,
      phone,
      language,
      notificationPreference
    } = req.body;

    const exists = await query(
      "SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1",
      [email, username]
    );

    if (exists.rowCount > 0) {
      return res.status(409).json({ message: "Email or username already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const created = await query(
      `INSERT INTO users
      (email, username, password_hash, first_name, last_name, phone, language, notification_preference)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, email, username, first_name, last_name, phone, language, notification_preference`,
      [
        email,
        username,
        passwordHash,
        firstName,
        lastName,
        phone || null,
        language,
        notificationPreference
      ]
    );

    const user = created.rows[0];
    const tokens = buildTokens(user);

    await query(
      "INSERT INTO refresh_tokens (token, user_id, revoked) VALUES ($1, $2, false)",
      [tokens.refreshToken, user.id]
    );

    return res.status(201).json({
      user,
      ...tokens
    });
  })
);

router.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { emailOrUsername, password } = req.body;

    const found = await query(
      `SELECT id, email, username, password_hash, first_name, last_name, phone, language, notification_preference
       FROM users
       WHERE email = $1 OR username = $1
       LIMIT 1`,
      [emailOrUsername]
    );

    if (found.rowCount === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = found.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const tokens = buildTokens(user);

    await query(
      "INSERT INTO refresh_tokens (token, user_id, revoked) VALUES ($1, $2, false)",
      [tokens.refreshToken, user.id]
    );

    delete user.password_hash;

    return res.status(200).json({
      user,
      ...tokens
    });
  })
);

router.post(
  "/refresh",
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    let payload;

    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const tokenRecord = await query(
      "SELECT token, revoked FROM refresh_tokens WHERE token = $1 LIMIT 1",
      [refreshToken]
    );

    if (tokenRecord.rowCount === 0 || tokenRecord.rows[0].revoked) {
      return res.status(401).json({ message: "Refresh token revoked" });
    }

    const userResult = await query(
      "SELECT id, email, username FROM users WHERE id = $1 LIMIT 1",
      [payload.sub]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    const user = userResult.rows[0];
    const nextTokens = buildTokens(user);

    await query("UPDATE refresh_tokens SET revoked = true WHERE token = $1", [refreshToken]);
    await query(
      "INSERT INTO refresh_tokens (token, user_id, revoked) VALUES ($1, $2, false)",
      [nextTokens.refreshToken, user.id]
    );

    return res.status(200).json(nextTokens);
  })
);

router.post(
  "/logout",
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    await query("UPDATE refresh_tokens SET revoked = true WHERE token = $1", [refreshToken]);
    return res.status(204).send();
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = await query(
      `SELECT id, email, username, first_name, last_name, phone, language, notification_preference
       FROM users WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );

    if (me.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json(me.rows[0]);
  })
);

router.patch(
  "/profile",
  requireAuth,
  validateBody(profileUpdateSchema),
  asyncHandler(async (req, res) => {
    const updates = [];
    const values = [];
    let i = 1;

    const map = {
      firstName: "first_name",
      lastName: "last_name",
      phone: "phone",
      language: "language",
      notificationPreference: "notification_preference"
    };

    for (const [key, dbField] of Object.entries(map)) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates.push(`${dbField} = $${i}`);
        values.push(req.body[key]);
        i += 1;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No profile fields provided" });
    }

    values.push(req.user.id);

    const result = await query(
      `UPDATE users
       SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = $${i}
       RETURNING id, email, username, first_name, last_name, phone, language, notification_preference`,
      values
    );

    return res.status(200).json(result.rows[0]);
  })
);

module.exports = router;

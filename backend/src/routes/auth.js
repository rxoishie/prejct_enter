const express = require("express");
const bcrypt = require("bcryptjs");
const { createHash } = require("node:crypto");
const rateLimit = require("express-rate-limit");

const env = require("../config/env");
const { query } = require("../db/pool");
const { asyncHandler } = require("../middleware/error");
const { validateBody } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  profileUpdateSchema
} = require("../schemas/auth");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} = require("../utils/jwt");

const router = express.Router();

const authLoginRateLimiter = rateLimit({
  windowMs: env.authLoginRateLimitWindowMs,
  max: env.authLoginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false
});

const authRefreshRateLimiter = rateLimit({
  windowMs: env.authRefreshRateLimitWindowMs,
  max: env.authRefreshRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false
});

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function secondsUntil(untilDate) {
  const deltaMs = new Date(untilDate).getTime() - Date.now();
  return Math.max(1, Math.ceil(deltaMs / 1000));
}

function hashLoginKey(scope, rawValue) {
  return createHash("sha256")
    .update(`${scope}:${String(rawValue || "").trim().toLowerCase()}`)
    .digest("hex");
}

function buildLoginThrottleKeys(req, emailOrUsername) {
  return [
    {
      scope: "identity",
      keyHash: hashLoginKey("identity", emailOrUsername)
    },
    {
      scope: "ip",
      keyHash: hashLoginKey("ip", req.ip || "unknown")
    }
  ];
}

function keyParams(keys) {
  return [keys[0].scope, keys[0].keyHash, keys[1].scope, keys[1].keyHash];
}

async function resetExpiredThrottleKeys(keys) {
  await query(
    `UPDATE auth_login_throttles
     SET failed_attempts = 0,
         lockout_until = NULL,
         updated_at = NOW()
     WHERE (scope, key_hash) IN (($1, $2), ($3, $4))
       AND lockout_until IS NOT NULL
       AND lockout_until <= NOW()`,
    keyParams(keys)
  );
}

async function getActiveLockout(keys) {
  const active = await query(
    `SELECT scope, lockout_until
     FROM auth_login_throttles
     WHERE (scope, key_hash) IN (($1, $2), ($3, $4))
       AND lockout_until IS NOT NULL
       AND lockout_until > NOW()
     ORDER BY lockout_until DESC
     LIMIT 1`,
    keyParams(keys)
  );

  if (active.rowCount === 0) {
    return null;
  }

  return active.rows[0];
}

async function registerFailedLoginAttempt(keys) {
  const states = [];

  for (const key of keys) {
    const updated = await query(
      `INSERT INTO auth_login_throttles (scope, key_hash, failed_attempts, lockout_until, updated_at)
       VALUES (
         $1,
         $2,
         1,
         CASE
           WHEN 1 >= $3 THEN NOW() + ($4 * INTERVAL '1 second')
           ELSE NULL
         END,
         NOW()
       )
       ON CONFLICT (scope, key_hash)
       DO UPDATE SET
         failed_attempts = auth_login_throttles.failed_attempts + 1,
         lockout_until = CASE
           WHEN auth_login_throttles.failed_attempts + 1 >= $3
             THEN NOW() + ($4 * INTERVAL '1 second')
           ELSE NULL
         END,
         updated_at = NOW()
       RETURNING scope, failed_attempts, lockout_until`,
      [
        key.scope,
        key.keyHash,
        env.authLoginMaxFailedAttempts,
        env.authLoginLockoutSeconds
      ]
    );

    states.push(updated.rows[0]);
  }

  return states;
}

async function clearThrottleState(keys) {
  await query(
    "DELETE FROM auth_login_throttles WHERE (scope, key_hash) IN (($1, $2), ($3, $4))",
    keyParams(keys)
  );
}

async function recordAuthAuditEvent(req, eventType, subjectHash, userId, metadata = {}) {
  try {
    await query(
      `INSERT INTO auth_audit_events (event_type, subject_hash, user_id, ip, request_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        eventType,
        subjectHash,
        userId || null,
        req.ip || "",
        req.requestId || "",
        JSON.stringify(metadata)
      ]
    );
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "auth_audit_event_write_failed",
        requestId: req.requestId,
        reason: error.message
      })
    );
  }
}

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
  authLoginRateLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { emailOrUsername, password } = req.body;
    const throttleKeys = buildLoginThrottleKeys(req, emailOrUsername);
    const identityHash = throttleKeys[0].keyHash;

    await resetExpiredThrottleKeys(throttleKeys);

    const preExistingLockout = await getActiveLockout(throttleKeys);
    if (preExistingLockout) {
      const retryAfter = secondsUntil(preExistingLockout.lockout_until);
      res.setHeader("Retry-After", String(retryAfter));
      await recordAuthAuditEvent(req, "login_locked", identityHash, null, {
        lockoutScope: preExistingLockout.scope,
        retryAfterSeconds: retryAfter
      });
      return res.status(429).json({ message: "Account temporarily locked due to failed login attempts" });
    }

    const found = await query(
      `SELECT id, email, username, password_hash, first_name, last_name, phone, language, notification_preference
       FROM users
       WHERE email = $1 OR username = $1
       LIMIT 1`,
      [emailOrUsername]
    );

    if (found.rowCount === 0) {
      const states = await registerFailedLoginAttempt(throttleKeys);
      const lockedState = states.find(
        (state) => state.lockout_until && new Date(state.lockout_until).getTime() > Date.now()
      );

      if (lockedState) {
        const retryAfter = secondsUntil(lockedState.lockout_until);
        res.setHeader("Retry-After", String(retryAfter));
        await recordAuthAuditEvent(req, "login_locked", identityHash, null, {
          lockoutScope: lockedState.scope,
          retryAfterSeconds: retryAfter
        });
        return res.status(429).json({ message: "Account temporarily locked due to failed login attempts" });
      }

      await recordAuthAuditEvent(req, "login_failed", identityHash, null, {
        reason: "unknown_identity",
        failedAttemptsByScope: Object.fromEntries(states.map((state) => [state.scope, state.failed_attempts]))
      });

      const backoffSeconds = Math.min(
        env.authLoginBackoffMaxSeconds,
        env.authLoginBackoffBaseSeconds * Math.max(0, Math.max(...states.map((state) => state.failed_attempts)) - 1)
      );
      if (backoffSeconds > 0) {
        await sleepMs(backoffSeconds * 1000);
      }

      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = found.rows[0];

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      const states = await registerFailedLoginAttempt(throttleKeys);
      const lockedState = states.find(
        (state) => state.lockout_until && new Date(state.lockout_until).getTime() > Date.now()
      );

      if (lockedState) {
        const retryAfter = secondsUntil(lockedState.lockout_until);
        res.setHeader("Retry-After", String(retryAfter));
        await recordAuthAuditEvent(req, "login_locked", identityHash, user.id, {
          lockoutScope: lockedState.scope,
          retryAfterSeconds: retryAfter
        });
        return res.status(429).json({ message: "Account temporarily locked due to failed login attempts" });
      }

      await recordAuthAuditEvent(req, "login_failed", identityHash, user.id, {
        reason: "invalid_password",
        failedAttemptsByScope: Object.fromEntries(states.map((state) => [state.scope, state.failed_attempts]))
      });

      const backoffSeconds = Math.min(
        env.authLoginBackoffMaxSeconds,
        env.authLoginBackoffBaseSeconds * Math.max(0, Math.max(...states.map((state) => state.failed_attempts)) - 1)
      );
      if (backoffSeconds > 0) {
        await sleepMs(backoffSeconds * 1000);
      }

      return res.status(401).json({ message: "Invalid credentials" });
    }

    await clearThrottleState(throttleKeys);
    await recordAuthAuditEvent(req, "login_success", identityHash, user.id, {
      subject: "auth_login"
    });

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
  authRefreshRateLimiter,
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

router.post(
  "/change-password",
  requireAuth,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password must be different from current password" });
    }

    const userResult = await query(
      "SELECT id, password_hash FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.rows[0];
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const nextPasswordHash = await bcrypt.hash(newPassword, 12);

    await query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [nextPasswordHash, req.user.id]
    );

    await query("UPDATE refresh_tokens SET revoked = true WHERE user_id = $1", [req.user.id]);

    return res.status(200).json({
      message: "Password updated successfully"
    });
  })
);

module.exports = router;

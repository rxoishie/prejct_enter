const bcrypt = require("bcryptjs");

const { pool } = require("./pool");
const { signRefreshToken } = require("../utils/jwt");

async function seed() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const userResult = await pool.query(
    `INSERT INTO users
      (email, username, password_hash, first_name, last_name, phone, language, notification_preference)
     VALUES
      ('aishatou@example.com', 'Aishatou', $1, 'Aishatou', 'Diallo', '+221770000000', 'fr', 'all')
     ON CONFLICT (email)
       DO UPDATE SET
        username = EXCLUDED.username,
        failed_login_attempts = 0,
        lockout_until = NULL
     RETURNING id, email, username`,
    [passwordHash]
  );

  const user = userResult.rows[0];

  const zones = [
    ["Zone 1", "auto", 30, 70, "zone1-device"],
    ["Zone 2", "manual", 35, 75, "zone2-device"],
    ["Zone 3", "auto", 40, 80, "zone3-device"]
  ];

  for (const zone of zones) {
    await pool.query(
      `INSERT INTO zones (user_id, name, mode, humidity_threshold_min, humidity_threshold_max, device_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, name) DO NOTHING`,
      [user.id, zone[0], zone[1], zone[2], zone[3], zone[4]]
    );
  }

  const zoneRows = await pool.query("SELECT id, name FROM zones WHERE user_id = $1", [user.id]);

  for (const row of zoneRows.rows) {
    await pool.query(
      `INSERT INTO sensor_readings (zone_id, humidity, temperature, valve_status, flow_rate, recorded_at)
       VALUES ($1, 52, 24, false, 0, NOW() - INTERVAL '5 minutes')`,
      [row.id]
    );
  }

  const refreshToken = signRefreshToken({ sub: user.id, email: user.email, username: user.username });

  await pool.query(
    "INSERT INTO refresh_tokens (token, user_id, revoked) VALUES ($1, $2, false) ON CONFLICT (token) DO NOTHING",
    [refreshToken, user.id]
  );

  console.log("Seed completed successfully");
}

seed()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

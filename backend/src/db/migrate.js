const fs = require("fs");
const path = require("path");

const { pool } = require("./pool");

async function runMigrations() {
  const migrationsPath = path.join(__dirname, "../../sql/migrations");
  const files = fs
    .readdirSync(migrationsPath)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsPath, file), "utf8");
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
  }

  console.log("Migrations complete");
}

runMigrations()
  .catch((error) => {
    console.error("Migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

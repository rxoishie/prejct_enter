import assert from "node:assert/strict";
import test from "node:test";

const BASE_URL = process.env.BASE_URL || "http://localhost:4000/api/v1";
const USERNAME = process.env.SMOKE_USERNAME || "Aishatou";
const PASSWORD = process.env.SMOKE_PASSWORD || "password123";

function toRootUrl(apiUrl) {
  return apiUrl.replace(/\/api\/v1\/?$/, "");
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(
      `Impossible de joindre ${url}. Démarrez le serveur backend avant de lancer les tests. Détail: ${error.message}`
    );
  }

  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;

  return { response, body };
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

test("health endpoint répond correctement", async () => {
  const healthUrl = `${toRootUrl(BASE_URL)}/health`;
  const response = await fetch(healthUrl);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
});

test("auth/login retourne des tokens et un utilisateur", async () => {
  const { response, body } = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailOrUsername: USERNAME,
      password: PASSWORD
    })
  });

  assert.equal(response.status, 200);
  assert.equal(typeof body.accessToken, "string");
  assert.equal(typeof body.refreshToken, "string");
  assert.equal(typeof body.user, "object");
  assert.equal(typeof body.user.id, "string");
});

test("auth/me, zones, dashboard et historique renvoient les formats attendus", async () => {
  const login = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailOrUsername: USERNAME,
      password: PASSWORD
    })
  });

  assert.equal(login.response.status, 200);
  const token = login.body.accessToken;
  assert.equal(typeof token, "string");

  const authHeaders = {
    Authorization: `Bearer ${token}`
  };

  const me = await request("/auth/me", { headers: authHeaders });
  assert.equal(me.response.status, 200);
  assert.equal(typeof me.body.email, "string");

  const zones = await request("/zones", { headers: authHeaders });
  assert.equal(zones.response.status, 200);
  assert.equal(Array.isArray(zones.body), true);
  assert.ok(zones.body.length >= 1, "Aucune zone trouvée. Lancez d'abord le seed.");

  const dashboard = await request("/dashboard/summary", { headers: authHeaders });
  assert.equal(dashboard.response.status, 200);
  assert.equal(typeof dashboard.body.activeZones, "number");
  assert.equal(typeof dashboard.body.activeAlerts, "number");
  assert.equal(typeof dashboard.body.runningIrrigations, "number");

  const firstZoneId = zones.body[0].id;
  const history = await request(`/irrigation-events?zoneId=${encodeURIComponent(firstZoneId)}&limit=5`, {
    headers: authHeaders
  });
  assert.equal(history.response.status, 200);
  assert.equal(Array.isArray(history.body.items), true);
  assert.equal(typeof history.body.count, "number");
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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

async function loginAndGetSession() {
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

  return body;
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

test("ready endpoint répond correctement", async () => {
  const readyUrl = `${toRootUrl(BASE_URL)}/ready`;
  const response = await fetch(readyUrl);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ready");
});

test("les reponses incluent un x-request-id", async () => {
  const { response } = await request("/zones");
  const requestId = response.headers.get("x-request-id");

  assert.equal(typeof requestId, "string");
  assert.ok(requestId.length > 0);
});

test("le backend propage un x-request-id fourni par le client", async () => {
  const clientRequestId = `test-${randomUUID()}`;

  const { response } = await request("/zones", {
    headers: {
      "x-request-id": clientRequestId
    }
  });

  assert.equal(response.headers.get("x-request-id"), clientRequestId);
});

test("api v1 renvoie les en-tetes de version", async () => {
  const { response } = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailOrUsername: USERNAME,
      password: PASSWORD
    })
  });

  assert.equal(response.headers.get("x-api-version"), "v1");
  assert.equal(response.headers.get("deprecation"), "false");
  assert.equal(response.headers.get("sunset"), "TBD");
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
  const login = await loginAndGetSession();
  const token = login.accessToken;
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

test("auth/login refuse un mot de passe invalide", async () => {
  const { response, body } = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailOrUsername: USERNAME,
      password: "wrong-password"
    })
  });

  assert.equal(response.status, 401);
  assert.equal(body.message, "Invalid credentials");
});

test("zones requiert un token Bearer valide", async () => {
  const missing = await request("/zones");
  assert.equal(missing.response.status, 401);
  assert.equal(missing.body.message, "Missing or invalid authorization header");

  const invalid = await request("/zones", {
    headers: {
      Authorization: "Bearer invalid.token.value"
    }
  });
  assert.equal(invalid.response.status, 401);
  assert.equal(invalid.body.message, "Invalid or expired access token");
});

test("auth/register refuse un utilisateur déjà existant", async () => {
  const { response, body } = await request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "aishatou@example.com",
      username: "Aishatou",
      password: "password123",
      firstName: "Aishatou",
      lastName: "Diallo",
      language: "fr",
      notificationPreference: "all"
    })
  });

  assert.equal(response.status, 409);
  assert.equal(body.message, "Email or username already exists");
});

test("auth/profile refuse une mise à jour vide", async () => {
  const session = await loginAndGetSession();

  const { response, body } = await request("/auth/profile", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`
    },
    body: JSON.stringify({})
  });

  assert.equal(response.status, 400);
  assert.equal(body.message, "No profile fields provided");
});

test("schedules retourne une erreur de validation pour un payload invalide", async () => {
  const session = await loginAndGetSession();

  const { response, body } = await request("/schedules", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`
    },
    body: JSON.stringify({
      zoneId: "not-a-uuid",
      timeOfDay: "99:99",
      recurrence: "invalid"
    })
  });

  assert.equal(response.status, 400);
  assert.equal(body.message, "Validation error");
  assert.equal(Array.isArray(body.errors), true);
  assert.ok(body.errors.length >= 1);
});

test("zones/:id renvoie 404 pour une zone inconnue", async () => {
  const session = await loginAndGetSession();

  const { response, body } = await request(`/zones/${randomUUID()}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(response.status, 404);
  assert.equal(body.message, "Zone not found");
});

test("irrigation start retourne 409 si déjà en cours", async () => {
  const session = await loginAndGetSession();

  const zones = await request("/zones", {
    headers: {
      Authorization: `Bearer ${session.accessToken}`
    }
  });

  assert.equal(zones.response.status, 200);
  assert.ok(zones.body.length >= 1);
  const zoneId = zones.body[0].id;

  const startOne = await request(`/zones/${zoneId}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`
    },
    body: JSON.stringify({ triggeredBy: "manual" })
  });

  assert.equal(startOne.response.status, 201);

  const startTwo = await request(`/zones/${zoneId}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`
    },
    body: JSON.stringify({ triggeredBy: "manual" })
  });

  assert.equal(startTwo.response.status, 409);
  assert.equal(startTwo.body.message, "Irrigation already running for this zone");

  const stop = await request(`/zones/${zoneId}/stop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`
    },
    body: JSON.stringify({ status: "success" })
  });

  assert.equal(stop.response.status, 200);
});

test("auth/logout révoque le refresh token puis refresh échoue", async () => {
  const session = await loginAndGetSession();

  const logout = await request("/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken })
  });

  assert.equal(logout.response.status, 204);

  const refresh = await request("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken })
  });

  assert.equal(refresh.response.status, 401);
  assert.equal(refresh.body.message, "Refresh token revoked");
});

test("auth/logout est idempotent", async () => {
  const session = await loginAndGetSession();

  const first = await request("/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken })
  });

  const second = await request("/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken })
  });

  assert.equal(first.response.status, 204);
  assert.equal(second.response.status, 204);
});

test("auth/refresh refuse un token invalide", async () => {
  const { response, body } = await request("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: "not-a-jwt" })
  });

  assert.equal(response.status, 401);
  assert.equal(body.message, "Invalid refresh token");
});

test("auth/change-password met à jour les identifiants", async () => {
  const unique = randomUUID().slice(0, 8);
  const initialPassword = "password123";
  const nextPassword = "password456";
  const email = `pw-${unique}@example.com`;
  const username = `pw_${unique}`;

  const register = await request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      username,
      password: initialPassword,
      firstName: "Test",
      lastName: "Password",
      language: "fr",
      notificationPreference: "all"
    })
  });

  assert.equal(register.response.status, 201);
  assert.equal(typeof register.body.accessToken, "string");

  const change = await request("/auth/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${register.body.accessToken}`
    },
    body: JSON.stringify({
      currentPassword: initialPassword,
      newPassword: nextPassword
    })
  });

  assert.equal(change.response.status, 200);
  assert.equal(change.body.message, "Password updated successfully");

  const oldLogin = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailOrUsername: username,
      password: initialPassword
    })
  });

  assert.equal(oldLogin.response.status, 401);
  assert.equal(oldLogin.body.message, "Invalid credentials");

  const newLogin = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailOrUsername: username,
      password: nextPassword
    })
  });

  assert.equal(newLogin.response.status, 200);
  assert.equal(typeof newLogin.body.accessToken, "string");
});

test("auth/login verrouille temporairement apres trop d'echecs consecutifs", async () => {
  const unique = randomUUID().slice(0, 8);
  const email = `lock-${unique}@example.com`;
  const username = `lock_${unique}`;
  const password = "password123";
  const wrongPassword = "wrong-password";
  const maxFailedAttempts = Number.parseInt(process.env.AUTH_LOGIN_MAX_FAILED_ATTEMPTS || "5", 10);

  const register = await request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.11" },
    body: JSON.stringify({
      email,
      username,
      password,
      firstName: "Lock",
      lastName: "User",
      language: "fr",
      notificationPreference: "all"
    })
  });

  assert.equal(register.response.status, 201);

  for (let i = 1; i <= maxFailedAttempts; i += 1) {
    const failed = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.11" },
      body: JSON.stringify({
        emailOrUsername: username,
        password: wrongPassword
      })
    });

    if (i < maxFailedAttempts) {
      assert.equal(failed.response.status, 401);
      assert.equal(failed.body.message, "Invalid credentials");
    } else {
      assert.equal(failed.response.status, 429);
      assert.equal(failed.body.message, "Account temporarily locked due to failed login attempts");
      assert.ok(Number.parseInt(failed.response.headers.get("retry-after") || "0", 10) >= 1);
    }
  }

  const locked = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.11" },
    body: JSON.stringify({
      emailOrUsername: username,
      password
    })
  });

  assert.equal(locked.response.status, 429);
  assert.equal(locked.body.message, "Account temporarily locked due to failed login attempts");
});

test("auth/login applique les verrous par IP et par identite", async () => {
  const unique = randomUUID().slice(0, 8);
  const maxFailedAttempts = Number.parseInt(process.env.AUTH_LOGIN_MAX_FAILED_ATTEMPTS || "5", 10);

  const userOne = {
    email: `ip-id-a-${unique}@example.com`,
    username: `ipida_${unique}`,
    password: "password123"
  };
  const userTwo = {
    email: `ip-id-b-${unique}@example.com`,
    username: `ipidb_${unique}`,
    password: "password123"
  };

  for (const user of [userOne, userTwo]) {
    const register = await request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        username: user.username,
        password: user.password,
        firstName: "Ip",
        lastName: "Identity",
        language: "fr",
        notificationPreference: "all"
      })
    });

    assert.equal(register.response.status, 201);
  }

  const sourceIp = "198.51.100.17";
  const otherIp = "203.0.113.19";

  for (let i = 1; i <= maxFailedAttempts; i += 1) {
    const failed = await request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": sourceIp
      },
      body: JSON.stringify({
        emailOrUsername: userOne.username,
        password: "wrong-password"
      })
    });

    if (i < maxFailedAttempts) {
      assert.equal(failed.response.status, 401);
      assert.equal(failed.body.message, "Invalid credentials");
    } else {
      assert.equal(failed.response.status, 429);
      assert.equal(failed.body.message, "Account temporarily locked due to failed login attempts");
      assert.ok(Number.parseInt(failed.response.headers.get("retry-after") || "0", 10) >= 1);
    }
  }

  const ipLocked = await request("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": sourceIp
    },
    body: JSON.stringify({
      emailOrUsername: userTwo.username,
      password: userTwo.password
    })
  });

  assert.equal(ipLocked.response.status, 429);
  assert.equal(ipLocked.body.message, "Account temporarily locked due to failed login attempts");

  const identityLocked = await request("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": otherIp
    },
    body: JSON.stringify({
      emailOrUsername: userOne.username,
      password: userOne.password
    })
  });

  assert.equal(identityLocked.response.status, 429);
  assert.equal(identityLocked.body.message, "Account temporarily locked due to failed login attempts");
});

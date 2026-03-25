(function () {
  const API_BASE = localStorage.getItem("apiBaseUrl") || "http://localhost:4000/api/v1";
  const ACCESS_KEY = "accessToken";
  const REFRESH_KEY = "refreshToken";
  const USER_KEY = "currentUser";
  const BANNER_ID = "api-status-banner";
  const TOAST_ID = "smartirri-toast";

  function shouldShowStatusBanner() {
    const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
    return !["", "index.html", "login.html", "signup.html"].includes(page);
  }

  function ensureStatusBanner() {
    if (!document || !document.body) {
      return;
    }

    if (document.getElementById(BANNER_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.textContent = `
      #${BANNER_ID} {
        position: fixed;
        left: 16px;
        bottom: 16px;
        z-index: 99999;
        padding: 10px 14px;
        border-radius: 999px;
        font-family: 'Poppins', sans-serif;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: #fff;
        box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        transition: opacity 0.2s ease;
      }
      #${BANNER_ID}.ok { background: #27ae60; }
      #${BANNER_ID}.loading { background: #f39c12; }
      #${BANNER_ID}.error { background: #e74c3c; }
      #${TOAST_ID} {
        position: fixed;
        right: 16px;
        top: 16px;
        z-index: 100000;
        min-width: 260px;
        max-width: 420px;
        padding: 12px 14px;
        border-radius: 12px;
        font-family: 'Poppins', sans-serif;
        font-size: 13px;
        font-weight: 500;
        color: #fff;
        box-shadow: 0 10px 24px rgba(0,0,0,0.22);
        opacity: 0;
        transform: translateY(-8px);
        pointer-events: none;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      #${TOAST_ID}.show {
        opacity: 1;
        transform: translateY(0);
      }
      #${TOAST_ID}.info { background: #3498db; }
      #${TOAST_ID}.success { background: #27ae60; }
      #${TOAST_ID}.warning { background: #f39c12; }
      #${TOAST_ID}.error { background: #e74c3c; }
    `;
    document.head.appendChild(style);

    if (shouldShowStatusBanner()) {
      const banner = document.createElement("div");
      banner.id = BANNER_ID;
      banner.className = "loading";
      banner.textContent = "API: vérification...";
      document.body.appendChild(banner);
    }

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.className = "info";
    document.body.appendChild(toast);
  }

  let toastTimer = null;

  function notify(message, type = "info", duration = 2800) {
    const toast = document.getElementById(TOAST_ID);
    if (!toast) {
      return;
    }

    toast.classList.remove("info", "success", "warning", "error", "show");
    toast.classList.add(type);
    toast.textContent = message;

    window.clearTimeout(toastTimer);
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    toastTimer = window.setTimeout(() => {
      toast.classList.remove("show");
    }, duration);
  }

  function notifyBar(message, type = "success", duration = 1500, showText = true) {
    const toast = document.getElementById(TOAST_ID);
    if (!toast) {
      return;
    }

    toast.classList.remove("info", "success", "warning", "error", "show");
    toast.classList.add(type);
    toast.textContent = showText ? message : "";
    toast.style.minWidth = showText ? "260px" : "12px";

    window.clearTimeout(toastTimer);
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    toastTimer = window.setTimeout(() => {
      toast.classList.remove("show");
      toast.style.minWidth = "260px";
    }, duration);
  }

  function setApiStatus(state, message) {
    const banner = document.getElementById(BANNER_ID);
    if (!banner) {
      return;
    }

    banner.classList.remove("ok", "loading", "error");
    banner.classList.add(state);
    banner.textContent = message;
  }

  function getAccessToken() {
    return localStorage.getItem(ACCESS_KEY);
  }

  function getRefreshToken() {
    return localStorage.getItem(REFRESH_KEY);
  }

  function saveSession(payload) {
    if (payload.accessToken) {
      localStorage.setItem(ACCESS_KEY, payload.accessToken);
    }
    if (payload.refreshToken) {
      localStorage.setItem(REFRESH_KEY, payload.refreshToken);
    }
    if (payload.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
    }
  }

  function clearSession() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function getCurrentUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function formatErrorMessage(responseBody, fallback) {
    if (responseBody && responseBody.message) {
      return responseBody.message;
    }
    return fallback || "Une erreur est survenue";
  }

  async function refreshAccessToken() {
    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      return false;
    }

    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });

    if (!response.ok) {
      clearSession();
      setApiStatus("error", "API: refresh token invalide");
      return false;
    }

    const data = await response.json();
    saveSession(data);
    return true;
  }

  async function apiRequest(path, options) {
    setApiStatus("loading", "API: synchronisation...");

    const requestOptions = Object.assign(
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      },
      options || {}
    );

    requestOptions.headers = Object.assign(
      { "Content-Type": "application/json" },
      requestOptions.headers || {}
    );

    const token = getAccessToken();
    if (token) {
      requestOptions.headers.Authorization = `Bearer ${token}`;
    }

    let response = await fetch(`${API_BASE}${path}`, requestOptions);

    if (response.status === 401 && token) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        requestOptions.headers.Authorization = `Bearer ${getAccessToken()}`;
        response = await fetch(`${API_BASE}${path}`, requestOptions);
      }
    }

    if (response.status === 204) {
      setApiStatus("ok", "API: connectée");
      return null;
    }

    const data = await response.json().catch(function () {
      return null;
    });

    if (!response.ok) {
      setApiStatus("error", "API: indisponible");
      throw new Error(formatErrorMessage(data, "Erreur API"));
    }

    setApiStatus("ok", "API: connectée");
    return data;
  }

  async function login(emailOrUsername, password) {
    const payload = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ emailOrUsername, password })
    });
    saveSession(payload);
    return payload;
  }

  async function register(user) {
    const payload = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(user)
    });
    saveSession(payload);
    return payload;
  }

  async function logout() {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await apiRequest("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken })
        });
      } catch (error) {
      }
    }
    clearSession();
  }

  async function fetchMe() {
    const me = await apiRequest("/auth/me");
    saveSession({ user: me });
    return me;
  }

  function requireAuthPage() {
    if (!getAccessToken()) {
      window.location.href = "login.html";
      return false;
    }
    return true;
  }

  window.SmartIrriApi = {
    apiBase: API_BASE,
    apiRequest,
    login,
    register,
    logout,
    fetchMe,
    requireAuthPage,
    getCurrentUser,
    saveSession,
    clearSession,
    setApiStatus,
    notify,
    notifyBar
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureStatusBanner);
  } else {
    ensureStatusBanner();
  }
})();

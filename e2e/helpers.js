const { expect } = require("@playwright/test");

async function login(page, username, password) {
  await page.goto("/login.html");
  await expect(page.locator("#loginForm")).toBeVisible();
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click("#loginSubmitBtn");
}

function createDisposableUser() {
  const token = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return {
    firstName: "E2E",
    lastName: "User",
    email: `e2e-${token}@example.com`,
    phone: "+212600000000",
    username: `e2e_${token}`,
    password: "password123"
  };
}

async function registerUser(page, user) {
  await page.goto("/signup.html");

  await page.fill("#firstName", user.firstName);
  await page.fill("#lastName", user.lastName);
  await page.fill("#email", user.email);
  await page.fill("#phone", user.phone);
  await page.click("button[onclick='nextSection(2)']");

  await page.fill("#username", user.username);
  await page.fill("#password", user.password);
  await page.fill("#confirmPassword", user.password);
  await page.click("button[onclick='nextSection(3)']");

  await page.selectOption("#language", "fr");
  await page.selectOption("#notifications", "all");
  await page.check("#terms");

  await page.click("#signupSubmitBtn");
  await expect(page.locator("#successModal")).toHaveClass(/show/);
}

module.exports = {
  login,
  createDisposableUser,
  registerUser
};

const { test, expect } = require("@playwright/test");
const { login } = require("./helpers");

test.describe("SmartIrri auth flows", () => {
  test("failed login shows an error message", async ({ page }) => {
    await login(page, "Aishatou", "wrong-password");

    await expect(page).toHaveURL(/login\.html/);
    await expect(page.locator("#errorMessage")).toBeVisible();
    await expect(page.locator("#errorMessage")).toContainText("Invalid credentials");
  });
});

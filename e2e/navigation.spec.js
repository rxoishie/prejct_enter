const { test, expect } = require("@playwright/test");
const { login } = require("./helpers");

test.describe("SmartIrri navigation flows", () => {
  test("zone navigation from dashboard opens a zone page", async ({ page }) => {
    await login(page, "Aishatou", "password123");

    await expect(page).toHaveURL(/dashboard\.html/);
    await expect(page.locator("#zonesGrid .zone-card").first()).toBeVisible();

    await page.locator("#zonesGrid .zone-card").first().click();

    await expect(page).toHaveURL(/zone[1-3]\.html/);
    await expect(page.locator(".zone-header h1")).toBeVisible();
  });
});

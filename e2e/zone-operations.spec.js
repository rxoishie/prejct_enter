const { test, expect } = require("@playwright/test");
const { login } = require("./helpers");

test.describe("SmartIrri zone operation flows", () => {
  test("manual irrigation start and stop updates zone status", async ({ page }) => {
    await login(page, "Aishatou", "password123");
    await expect(page).toHaveURL(/dashboard\.html/);

    await page.locator("#zonesGrid .zone-card").first().click();
    await expect(page).toHaveURL(/zone[1-3]\.html/);

    const zoneStatus = page.locator(".zone-status");
    await expect(zoneStatus).toBeVisible();

    const startBtn = page.locator("#startIrrigationBtn");
    const stopBtn = page.locator("#stopIrrigationBtn");

    await startBtn.click();
    await expect(zoneStatus).toContainText(/en cours/i);

    await stopBtn.click();
    await expect(zoneStatus).toContainText(/repos/i);
  });

  test("manual schedule time persists after page reload", async ({ page }) => {
    await login(page, "Aishatou", "password123");
    await expect(page).toHaveURL(/dashboard\.html/);

    await page.locator("#zonesGrid .zone-card").first().click();
    await expect(page).toHaveURL(/zone[1-3]\.html/);

    const scheduleTime = page.locator("#scheduleTime");
    const scheduleButton = page.locator("#scheduleIrrigationBtn");

    await scheduleTime.fill("09:25");
    await scheduleButton.click();

    await expect(page.locator("#smartirri-toast")).toContainText(/programme|programmé|programmee/i);

    await page.reload();
    await expect(page.locator("#loadingScreen")).toHaveClass(/fade-out/);
    await expect(scheduleTime).toHaveValue("09:25");
  });
});

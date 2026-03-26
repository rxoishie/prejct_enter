const { test, expect } = require("@playwright/test");
const { login } = require("./helpers");

test.describe("SmartIrri history flows", () => {
  test("history page loads irrigation rows", async ({ page }) => {
    await login(page, "Aishatou", "password123");
    await expect(page).toHaveURL(/dashboard\.html/);

    await page.goto("/historique.html");
    await expect(page.locator("#loadingScreen")).toHaveClass(/fade-out/);

    const initialHistoryResponsePromise = page.waitForResponse((response) => {
      return response.url().includes("/api/v1/irrigation-events?") && response.request().method() === "GET";
    });
    await page.click("button.filter-btn");

    const initialHistoryResponse = await initialHistoryResponsePromise;
    const initialHistoryPayload = await initialHistoryResponse.json();

    const rows = page.locator("#tableBody tr");
    await expect(rows).toHaveCount(initialHistoryPayload.items.length);
  });

  test("status filter triggers API request and updates table", async ({ page }) => {
    await login(page, "Aishatou", "password123");
    await expect(page).toHaveURL(/dashboard\.html/);

    await page.goto("/historique.html");
    await expect(page.locator("#loadingScreen")).toHaveClass(/fade-out/);

    await page.selectOption("#statusFilter", "success");

    const responsePromise = page.waitForResponse((response) => {
      return response.url().includes("/api/v1/irrigation-events?") && response.url().includes("status=success") && response.request().method() === "GET";
    });

    await page.click("button.filter-btn");
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();

    const rows = page.locator("#tableBody tr");
    await expect(rows).toHaveCount(payload.items.length);

    if (payload.items.length > 0) {
      await expect(rows.first().locator("td").nth(5)).toContainText(/success/i);
    }
  });
});

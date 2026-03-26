const { test, expect } = require("@playwright/test");
const { login, createDisposableUser, registerUser } = require("./helpers");

test.describe("SmartIrri settings flows", () => {
  test("password modal shows mismatch validation", async ({ page }) => {
    await login(page, "Aishatou", "password123");
    await expect(page).toHaveURL(/dashboard\.html/);

    await page.goto("/Parametres.html");
    await page.click("#changePasswordBtn");

    await expect(page.locator("#currentPasswordInput")).toHaveAttribute("type", "password");
    await page.locator("button[data-target='currentPasswordInput']").click();
    await expect(page.locator("#currentPasswordInput")).toHaveAttribute("type", "text");
    await page.locator("button[data-target='currentPasswordInput']").click();
    await expect(page.locator("#currentPasswordInput")).toHaveAttribute("type", "password");

    await page.fill("#currentPasswordInput", "password123");
    await page.fill("#newPasswordInput", "password456");
    await page.fill("#confirmPasswordInput", "not-matching");
    await page.click("#passwordSubmitBtn");

    await expect(page.locator("#passwordModalError")).toBeVisible();
    await expect(page.locator("#passwordModalError")).toContainText("ne correspond pas");
  });

  test("password change success path", async ({ page }) => {
    const user = createDisposableUser();
    const nextPassword = "password456";

    await registerUser(page, user);
    await login(page, user.username, user.password);

    await expect(page).toHaveURL(/dashboard\.html/);
    await page.goto("/Parametres.html");
    await page.click("#changePasswordBtn");

    await page.fill("#currentPasswordInput", user.password);
    await page.fill("#newPasswordInput", nextPassword);
    await page.fill("#confirmPasswordInput", nextPassword);
    await page.click("#passwordSubmitBtn");

    await expect(page).toHaveURL(/login\.html/, { timeout: 15_000 });

    await login(page, user.username, nextPassword);
    await expect(page).toHaveURL(/dashboard\.html/);
  });

  test("notifications preference is persisted on profile", async ({ page }) => {
    const user = createDisposableUser();

    await registerUser(page, user);
    await login(page, user.username, user.password);

    await expect(page).toHaveURL(/dashboard\.html/);
    await page.goto("/Parametres.html");
    await expect(page.locator("#loadingScreen")).toHaveClass(/fade-out/);

    const alertLow = page.locator("#alertLow");
    const alertLowSlider = page.locator("label.switch:has(#alertLow) .slider");
    await expect(alertLow).toBeChecked();

    await alertLowSlider.click();
    await expect(alertLow).not.toBeChecked();
    await page.click("#saveNotificationsBtn");

    await expect(page.locator("#smartirri-toast")).toHaveText(/Notifications mises a jour|Notifications mises à jour/);

    const notificationPreference = await page.evaluate(async () => {
      const me = await window.SmartIrriApi.fetchMe();
      return me.notification_preference;
    });

    expect(notificationPreference).toBe("important");

    await alertLowSlider.click();
    await expect(alertLow).toBeChecked();
    await page.click("#saveNotificationsBtn");

    const revertedPreference = await page.evaluate(async () => {
      const me = await window.SmartIrriApi.fetchMe();
      return me.notification_preference;
    });

    expect(revertedPreference).toBe("all");
  });
});

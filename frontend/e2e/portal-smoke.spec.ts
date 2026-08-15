import { expect, test } from "@playwright/test";

async function openWorkspaceLink(page: import("@playwright/test").Page, name: string) {
  if ((page.viewportSize()?.width || 1280) <= 820) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page.getByRole("link", { name, exact: true }).first().click();
}

test("patient can sign in and open appointments", async ({ page }) => {
  await page.goto("/patient/login");
  await page.getByLabel("Phone number").fill("9000000001");
  await page.getByLabel("Password", { exact: true }).fill("Demo1234!");
  await page.getByRole("button", { name: /sign in securely/i }).click();
  await expect(page).toHaveURL(/\/patient\/dashboard/);
  await expect(page.getByRole("link", { name: "Skip to main content" })).toHaveCount(1);
  await openWorkspaceLink(page, "Appointments");
  await expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible();
});

test("approved doctor can open clinical workspace", async ({ page }) => {
  await page.goto("/doctor/login");
  await page.getByLabel("Professional email").fill("doctor@soulplace.demo");
  await page.getByLabel("Password", { exact: true }).fill("Demo1234!");
  await page.getByRole("button", { name: /sign in securely/i }).click();
  await expect(page).toHaveURL(/\/doctor\/dashboard/);
  await openWorkspaceLink(page, "Requests");
  await expect(page.getByRole("heading", { name: "Patient requests" })).toBeVisible();
});

test("administrator can open doctor approvals", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Work email").fill("admin@soulplace.demo");
  await page.getByLabel("Password", { exact: true }).fill("Demo1234!");
  await page.getByRole("button", { name: /sign in securely/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await openWorkspaceLink(page, "Doctor approvals");
  await expect(page.getByRole("heading", { name: "Doctors" })).toBeVisible();
});

test("approved doctor can create and open a Meet room", async ({ page }) => {
  await page.goto("/doctor/login");
  await page.getByLabel("Professional email").fill("doctor@soulplace.demo");
  await page.getByLabel("Password", { exact: true }).fill("Demo1234!");
  await page.getByRole("button", { name: /sign in securely/i }).click();
  await page.goto("/doctor/appointments/APT-DEMO-001");

  await page.getByRole("button", { name: "Create Google Meet" }).click();
  const joinLink = page.getByRole("link", { name: /Join Google Meet/i });
  await expect(joinLink).toBeVisible();
  await expect(joinLink).toHaveAttribute(
    "href",
    "https://meet.google.com/abc-defg-hij"
  );
});

test("patient can access only the saved canonical Meet room", async ({ page }) => {
  await page.goto("/patient/login");
  await page.getByLabel("Phone number").fill("9000000001");
  await page.getByLabel("Password", { exact: true }).fill("Demo1234!");
  await page.getByRole("button", { name: /sign in securely/i }).click();
  await page.goto("/patient/appointments/APT-DEMO-005");

  const joinLink = page.getByRole("link", { name: /Join consultation/i });
  await expect(joinLink).toBeVisible();
  await expect(joinLink).toHaveAttribute(
    "href",
    "https://meet.google.com/abc-defg-hij"
  );
});

import { test, expect } from '@playwright/test';

test('homepage has expected title and loads', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await expect(page).toHaveTitle(/Smart Hub|Dashboard|Login/i);
  await expect(page.locator('body')).toBeVisible();
});

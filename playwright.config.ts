import { defineConfig, devices } from '@playwright/test';

const PORT = 5190;
const external = process.env.BASE_URL;
const server = process.env.E2E_PREVIEW
  ? `npx vite preview --port ${PORT} --strictPort`
  : `npx vite --port ${PORT} --strictPort`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: external ?? `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: external
    ? undefined
    : { command: server, url: `http://localhost:${PORT}`, reuseExistingServer: !process.env.CI },
});

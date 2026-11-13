import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const CI = !!process.env.CI;

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.{ts,js}',
	fullyParallel: true,
	forbidOnly: CI,
	retries: CI ? 2 : 0,
	reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: `pnpm exec vite build && pnpm exec vite preview --port ${PORT} --strictPort`,
		port: PORT,
		reuseExistingServer: !CI,
		timeout: 120_000
	}
});

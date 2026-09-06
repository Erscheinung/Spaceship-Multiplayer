import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', timeout: 90000, workers: 1, expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }, screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node scripts/test-signaling.js', url: 'http://127.0.0.1:9000', reuseExistingServer: false },
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: false, env: { PUBLIC_PEER_HOST: '127.0.0.1', PUBLIC_PEER_PORT: '9000', PUBLIC_PEER_PATH: '/', PUBLIC_PEER_SECURE: 'false' } }
  ]
});

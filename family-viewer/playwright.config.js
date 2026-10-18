import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 25000,
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: { baseURL:'http://127.0.0.1:5173', locale:'he-IL', timezoneId:'Asia/Jerusalem', trace:'retain-on-failure' },
  projects: [
    { name:'desktop', use:{viewport:{width:1440,height:1000}} },
    { name:'mobile', use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true} },
  ],
});

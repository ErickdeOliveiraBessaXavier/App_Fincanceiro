import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'fs';

// Playwright lê .env automaticamente, mas não .env.local (convenção do Vite).
// Este bloco carrega .env.local para que as variáveis de teste fiquem disponíveis.
try {
  readFileSync('.env.local', 'utf-8')
    .split('\n')
    .forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] ??= match[2].trim();
    });
} catch {
  // .env.local ausente — variáveis devem vir do ambiente ou do .env
}

/**
 * Configuração do Playwright para testes E2E.
 *
 * Variáveis necessárias em .env.local:
 *   PLAYWRIGHT_EMAIL       — e-mail do usuário operador de teste
 *   PLAYWRIGHT_SENHA       — senha do usuário operador de teste
 *   PLAYWRIGHT_CLIENTE_ID  — UUID de um cliente existente no banco
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:8080',
    trace: 'off',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    channel: 'msedge',
  },

  projects: [
    // 1. Faz login e salva o estado de autenticação.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    // 2. Testes rodando com o estado salvo (já autenticado).
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Usa o Edge já instalado no Windows — evita baixar o Chromium.
        channel: 'msedge',
        storageState: 'e2e/.auth/operador.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    // Reutiliza o servidor se já estiver rodando (evita subir dois processos).
    reuseExistingServer: true,
    timeout: 30_000,
  },
});

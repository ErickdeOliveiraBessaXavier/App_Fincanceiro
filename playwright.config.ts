import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'fs';

// Carrega .env.local e .env (nessa ordem: o local vence). O Playwright não lê
// nenhum dos dois sozinho. O .env traz o que a limpeza pós-testes precisa
// (SUPABASE_ACCESS_TOKEN, VITE_SUPABASE_PROJECT_ID).
for (const arquivo of ['.env.local', '.env']) {
  try {
    readFileSync(arquivo, 'utf-8')
      .split('\n')
      .forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] ??= match[2].trim().replace(/^"(.*)"$/, '$1');
      });
  } catch {
    // arquivo ausente — variáveis devem vir do ambiente
  }
}

/**
 * Configuração do Playwright para testes E2E.
 *
 * Variáveis necessárias em .env.local:
 *   PLAYWRIGHT_EMAIL       — e-mail do usuário operador de teste
 *   PLAYWRIGHT_SENHA       — senha do usuário operador de teste
 *   PLAYWRIGHT_CLIENTE_ID  — UUID de um cliente existente no banco
 *
 * Os testes gravam na ficha desse cliente; o projeto "limpeza" apaga o que foi
 * gravado ao final (e2e/limpeza.teardown.ts — precisa do SUPABASE_ACCESS_TOKEN
 * do .env; sem ele só avisa).
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
    channel: 'chrome',
  },

  projects: [
    // 1. Faz login e salva o estado de autenticação.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      // Roda depois de todos os projetos que dependem do setup, mesmo com falha.
      teardown: 'limpeza',
    },
    // 3. Apaga o que os testes gravaram no banco.
    {
      name: 'limpeza',
      testMatch: /limpeza\.teardown\.ts/,
    },
    // 2. Testes rodando com o estado salvo (já autenticado).
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Usa o Chrome já instalado — evita baixar o Chromium. (Era o Edge,
        // que não está instalado nesta máquina.)
        channel: 'chrome',
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

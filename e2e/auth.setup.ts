import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '.auth/operador.json');

/**
 * Roda uma única vez antes de todos os testes.
 * Faz login como operador e salva o estado de autenticação
 * (cookies + localStorage do Supabase) em e2e/.auth/operador.json.
 * Os testes do projeto "chromium" carregam esse estado e já começam logados.
 */
setup('autenticar como operador', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_EMAIL;
  const senha = process.env.PLAYWRIGHT_SENHA;

  if (!email || !senha) {
    throw new Error(
      'Defina PLAYWRIGHT_EMAIL e PLAYWRIGHT_SENHA no .env.local antes de rodar os testes.'
    );
  }

  await page.goto('/auth');

  // Aguarda a aba de login estar visível (a página usa React.lazy)
  await expect(page.locator('#login-email')).toBeVisible({ timeout: 15_000 });

  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Aguarda sair da página de auth
  await page.waitForURL(url => !url.href.includes('/auth'), { timeout: 15_000 });

  // O token do Supabase fica no localStorage em milissegundos após o redirect.
  // Aguardamos 3s para garantir que o estado de auth foi persistido antes de salvar.
  await page.waitForTimeout(3000);

  mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});

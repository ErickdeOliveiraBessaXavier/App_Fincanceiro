import { test, expect } from '@playwright/test';

/**
 * Carteira do cobrador (Rodada 2 da auditoria): ele só enxerga o que é dele.
 *
 * Usa um cobrador real da empresa de teste, criado pelo fluxo de convite:
 * PLAYWRIGHT_COBRADOR_EMAIL / PLAYWRIGHT_COBRADOR_SENHA no .env.local.
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function entrarComoCobrador(page: import('@playwright/test').Page) {
  const email = process.env.PLAYWRIGHT_COBRADOR_EMAIL;
  const senha = process.env.PLAYWRIGHT_COBRADOR_SENHA;
  if (!email || !senha) throw new Error('Defina PLAYWRIGHT_COBRADOR_EMAIL e PLAYWRIGHT_COBRADOR_SENHA no .env.local.');
  await page.goto('/auth');
  await page.fill('#login-email', email);
  await page.fill('#login-password', senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 20_000 });
}

test('lista só clientes da própria carteira', async ({ page }) => {
  await entrarComoCobrador(page);
  await page.goto('/clientes');
  const linhas = page.locator('table tbody tr');
  await expect(linhas.first()).toBeVisible({ timeout: 20_000 });
  const responsaveis = await linhas.locator('td').nth(2).allInnerTexts();
  const nomeCobrador = (await page.getByText('Cobrador', { exact: true }).first().locator('..').innerText()).split('\n')[0];
  for (const texto of await linhas.allInnerTexts()) {
    expect(texto).toContain(`Cob: ${nomeCobrador}`);
  }
  expect(responsaveis.length).toBeGreaterThan(0);
});

test('formulário de cliente não oferece trocar a carteira', async ({ page }) => {
  await entrarComoCobrador(page);
  await page.goto('/clientes');
  await page.getByRole('button', { name: /novo cliente/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Cobrador', { exact: true })).toHaveCount(0);
});

test('telas de gestão não abrem para o cobrador', async ({ page }) => {
  await entrarComoCobrador(page);
  for (const rota of ['/atribuicao', '/equipe', '/configuracoes']) {
    await page.goto(rota);
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname, rota).not.toBe(rota);
  }
});

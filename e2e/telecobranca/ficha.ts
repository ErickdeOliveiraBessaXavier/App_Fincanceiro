import { expect, type Page } from '@playwright/test';

/**
 * Abre a ficha do cliente de teste (PLAYWRIGHT_CLIENTE_ID, no .env.local) na
 * aba "Registrar" do painel de atendimento.
 *
 * Desde a revisão de UX de 2026-08-11 a Telecobrança é a própria ficha
 * (/clientes/:id); /telecobranca/:id só redireciona. O resultado da cobrança
 * é registrado direto na aba, e "Agendar retorno" / "Registrar evento" abrem
 * modais a partir de links logo abaixo.
 */
export function clienteDeTeste(): string {
  const id = process.env.PLAYWRIGHT_CLIENTE_ID;
  if (!id) throw new Error('Defina PLAYWRIGHT_CLIENTE_ID no .env.local (um cliente existente da empresa de teste).');
  return id;
}

export async function abrirAbaRegistrar(page: Page) {
  await page.goto(`/clientes/${clienteDeTeste()}`);
  await page.getByRole('tab', { name: 'Registrar' }).click();
  // O painel só aparece depois que o papel do usuário carrega.
  await expect(page.getByText('O que aconteceu', { exact: false })).toBeVisible({ timeout: 20_000 });
}

export async function abrirModal(page: Page, link: 'Agendar retorno' | 'Registrar evento') {
  await abrirAbaRegistrar(page);
  await page.getByRole('button', { name: link }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

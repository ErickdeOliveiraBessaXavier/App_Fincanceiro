import { test, expect, type Page } from '@playwright/test';

/**
 * Testes E2E — Registrar Evento (Fase 3)
 *
 * Cobrem:
 *  - Dropdown filtrado: apenas tipos administrativos aparecem.
 *  - Tipos de resultado de cobrança não aparecem no dropdown.
 *  - Descrição do modal orienta o operador para Registrar Resultado.
 *  - Fluxo completo: selecionar tipo, preencher descrição, submeter.
 *
 * Pré-requisito: PLAYWRIGHT_CLIENTE_ID em .env.local deve apontar para
 * um cliente existente no banco de dados de desenvolvimento.
 */

function getClienteId(): string {
  const id = process.env.PLAYWRIGHT_CLIENTE_ID;
  if (!id) {
    throw new Error('Defina PLAYWRIGHT_CLIENTE_ID no .env.local.');
  }
  return id;
}

async function abrirTelecobranca(page: Page) {
  await page.goto(`/telecobranca/${getClienteId()}`);
  // Aguarda o botão aparecer — só renderiza quando isOperador=true (useUserRole resolvido)
  await expect(page.locator('button', { hasText: 'Novo Evento' })).toBeVisible({ timeout: 20_000 });
}

async function abrirModalRegistrarEvento(page: Page) {
  await page.locator('button', { hasText: 'Novo Evento' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

// ─── Fase 3: Dropdown filtrado ────────────────────────────────────────────────

test('dropdown exibe tipos administrativos', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalRegistrarEvento(page);

  await page.getByRole('combobox').click();

  await expect(page.getByRole('option', { name: 'Contato Receptivo' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Contato com Analista' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Anexar Arquivo' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'WhatsApp' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'E-mail' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Outro' })).toBeVisible();
});

test('dropdown não exibe tipos de resultado de cobrança', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalRegistrarEvento(page);

  await page.getByRole('combobox').click();

  await expect(page.getByRole('option', { name: 'Contato Com Cliente' })).not.toBeVisible();
  await expect(page.getByRole('option', { name: 'Alega Pagamento' })).not.toBeVisible();
  await expect(page.getByRole('option', { name: 'Devolução' })).not.toBeVisible();
  await expect(page.getByRole('option', { name: 'Ligação' })).not.toBeVisible();
  await expect(page.getByRole('option', { name: 'Cobrança Externa' })).not.toBeVisible();
  await expect(page.getByRole('option', { name: 'Cadastro Insuficiente' })).not.toBeVisible();
  await expect(page.getByRole('option', { name: 'Cliente Desconhecido' })).not.toBeVisible();
});

test('descrição do modal menciona Registrar Resultado', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalRegistrarEvento(page);

  await expect(page.getByRole('dialog')).toContainText('Registrar Resultado');
});

// ─── Fluxo completo ───────────────────────────────────────────────────────────

test('registra evento administrativo com sucesso', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalRegistrarEvento(page);

  // Seleciona "Outro" no dropdown
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Outro' }).click();

  // Preenche a descrição
  await page.getByPlaceholder(/descreva/i).fill('Evento de teste via Playwright');

  // Submete
  await page.getByRole('button', { name: 'Registrar' }).click();

  // Toast de sucesso
  await expect(page.getByText('Evento registrado com sucesso').first()).toBeVisible({ timeout: 10_000 });

  // Modal fecha
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('modal fecha ao cancelar sem criar registro', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalRegistrarEvento(page);

  await page.getByRole('button', { name: 'Cancelar' }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible();
});

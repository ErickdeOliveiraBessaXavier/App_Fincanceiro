import { test, expect, type Page } from '@playwright/test';

/**
 * Testes E2E — Registrar Resultado (smoke tests)
 *
 * Cobrem:
 *  - Modal abre com todos os status de cobrança disponíveis.
 *  - Próximo contato é sugerido automaticamente.
 *  - Orientação contextual é exibida ao selecionar um status.
 *  - Status de alta prioridade exibe alerta destrutivo.
 */

function getClienteId(): string {
  const id = process.env.PLAYWRIGHT_CLIENTE_ID;
  if (!id) throw new Error('Defina PLAYWRIGHT_CLIENTE_ID no .env.local.');
  return id;
}

async function abrirTelecobranca(page: Page) {
  await page.goto(`/telecobranca/${getClienteId()}`);
  // Aguarda o botão aparecer — só renderiza quando isOperador=true (useUserRole resolvido)
  await expect(page.locator('button', { hasText: 'Registrar Resultado' })).toBeVisible({ timeout: 20_000 });
}

async function abrirModalRegistrarResultado(page: Page) {
  await page.locator('button', { hasText: 'Registrar Resultado' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

// ─── Conteúdo do modal ────────────────────────────────────────────────────────

test('modal exibe todos os status de cobrança', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalRegistrarResultado(page);

  await page.getByRole('combobox').first().click();

  await expect(page.getByRole('option', { name: 'Promessa de Pagamento' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Não Atende' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Recado' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Sem Previsão de Pagamento' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Contato inexistente/inválido' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Devolução' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Suspeita de Fraude' })).toBeVisible();
});

test('campo Próximo Contato é preenchido automaticamente', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalRegistrarResultado(page);

  // O campo de próximo contato deve ter uma data sugerida (não vazia)
  const btnProximoContato = page.getByRole('button', { name: /\d{2}\/\d{2}\/\d{4}/ });
  await expect(btnProximoContato).toBeVisible();
});

test('Promessa de Pagamento exige data prevista', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalRegistrarResultado(page);

  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Promessa de Pagamento' }).click();

  // Campo de data prevista deve aparecer
  await expect(page.getByText('Data Prevista de Pagamento *', { exact: true })).toBeVisible();
});

test('Suspeita de Fraude exibe alerta de alta prioridade', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalRegistrarResultado(page);

  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Suspeita de Fraude' }).click();

  // Alert destrutivo com instrução de escalonamento
  await expect(page.getByRole('dialog')).toContainText('Gestão de Crédito');
});

test('modal fecha ao cancelar', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalRegistrarResultado(page);

  await page.getByRole('button', { name: 'Cancelar' }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible();
});

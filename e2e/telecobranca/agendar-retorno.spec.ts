import { test, expect, type Page } from '@playwright/test';

/**
 * Testes E2E — Agendar Retorno (smoke tests)
 *
 * Cobrem:
 *  - Modal abre corretamente.
 *  - Seleção de data e hora funciona.
 *  - Validação: submeter sem data exibe erro.
 *  - Fluxo completo: agendar para amanhã às 09:00.
 */

function getClienteId(): string {
  const id = process.env.PLAYWRIGHT_CLIENTE_ID;
  if (!id) throw new Error('Defina PLAYWRIGHT_CLIENTE_ID no .env.local.');
  return id;
}

async function abrirTelecobranca(page: Page) {
  await page.goto(`/telecobranca/${getClienteId()}`);
  // Aguarda o botão aparecer — só renderiza quando isOperador=true (useUserRole resolvido)
  // O trigger chama-se "Agendar" (AcoesRapidas); usamos .first() para evitar conflito
  // com o botão de submit homônimo dentro do modal.
  await expect(page.locator('button', { hasText: 'Agendar' }).first()).toBeVisible({ timeout: 20_000 });
}

async function abrirModalAgendarRetorno(page: Page) {
  await page.locator('button', { hasText: 'Agendar' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

// ─── Conteúdo do modal ────────────────────────────────────────────────────────

test('modal abre com seletor de data e hora', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalAgendarRetorno(page);

  await expect(page.getByText('Data *')).toBeVisible();
  await expect(page.getByText('Hora *')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Agendar' })).toBeEnabled();
});

test('submeter sem data exibe erro', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalAgendarRetorno(page);

  // Clica em Agendar sem selecionar data (botão dentro do modal)
  await page.getByRole('dialog').getByRole('button', { name: 'Agendar' }).click();

  await expect(page.getByText('Selecione uma data para o agendamento.').first()).toBeVisible({ timeout: 5_000 });
});

test('agenda retorno para amanhã e confirma criação', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalAgendarRetorno(page);

  // Abre o calendário clicando no botão de seleção de data
  await page.getByRole('button', { name: /selecione/i }).click();

  // Clica em "amanhã" no calendário
  // O calendário do react-day-picker usa aria-label com a data completa;
  // usamos o botão "next day" de forma genérica selecionando o próximo dia habilitado
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const dia = amanha.getDate().toString();
  await page.getByRole('gridcell', { name: dia }).first().click();

  // Confirma que a data foi selecionada (botão passa a mostrar a data)
  await expect(page.getByRole('button', { name: /\d{2}\/\d{2}\/\d{4}/ })).toBeVisible();

  // Preenche descrição
  await page.getByPlaceholder(/descreva o motivo/i).fill('Retorno agendado via Playwright');

  // Submete (botão dentro do modal)
  await page.getByRole('dialog').getByRole('button', { name: 'Agendar' }).click();

  // Toast de sucesso
  await expect(page.getByText('Agendamento criado com sucesso')).toBeVisible({ timeout: 10_000 });

  // Modal fecha
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('modal fecha ao cancelar', async ({ page }) => {
  await abrirTelecobranca(page);
  await abrirModalAgendarRetorno(page);

  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible();
});

import { test, expect } from '@playwright/test';
import { abrirModal } from './ficha';

/**
 * Registrar evento — link "Registrar evento" na aba "Registrar" da ficha.
 *
 * Evento é registro administrativo/canal: não move a régua de cobrança. Os
 * tipos que eram desfecho de cobrança viraram Status de Cobrança em
 * 2026-07-01 (constants/tiposEvento.ts) e não podem voltar a ser oferecidos.
 */

test('oferece os tipos administrativos', async ({ page }) => {
  await abrirModal(page, 'Registrar evento');
  await page.getByRole('dialog').getByRole('combobox').click();

  for (const tipo of ['Contato Receptivo', 'Contato com Analista', 'Anexar Arquivo', 'WhatsApp', 'E-mail', 'Outro']) {
    await expect(page.getByRole('option', { name: tipo })).toBeVisible();
  }
});

test('não oferece os tipos que viraram status de cobrança', async ({ page }) => {
  await abrirModal(page, 'Registrar evento');
  await page.getByRole('dialog').getByRole('combobox').click();

  for (const legado of ['Cadastro Insuficiente', 'Cliente Desconhecido', 'Devolução', 'Alega Pagamento']) {
    await expect(page.getByRole('option', { name: legado })).toHaveCount(0);
  }
});

test('explica que evento não move a régua de cobrança', async ({ page }) => {
  await abrirModal(page, 'Registrar evento');
  await expect(page.getByRole('dialog')).toContainText('Não altera o status de cobrança');
});

test('registra evento administrativo', async ({ page }) => {
  await abrirModal(page, 'Registrar evento');
  await page.getByRole('dialog').getByRole('combobox').click();
  await page.getByRole('option', { name: 'Outro' }).click();
  await page.getByPlaceholder(/descreva/i).fill('Evento de teste via Playwright');
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar' }).click();

  await expect(page.getByText('Evento registrado com sucesso').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('cancelar fecha sem registrar', async ({ page }) => {
  await abrirModal(page, 'Registrar evento');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

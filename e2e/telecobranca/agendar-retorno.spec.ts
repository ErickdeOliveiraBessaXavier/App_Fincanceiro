import { test, expect } from '@playwright/test';
import { abrirModal } from './ficha';

/** Agendar retorno — link "Agendar retorno" na aba "Registrar" da ficha. */

test('abre com data e hora', async ({ page }) => {
  await abrirModal(page, 'Agendar retorno');
  await expect(page.getByRole('dialog').getByText('Data *')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Hora *')).toBeVisible();
});

test('sem data mostra erro', async ({ page }) => {
  await abrirModal(page, 'Agendar retorno');
  await page.getByRole('dialog').getByRole('button', { name: 'Agendar' }).click();
  await expect(page.getByText('Selecione uma data para o agendamento.').first()).toBeVisible({ timeout: 5_000 });
});

test('agenda retorno para amanhã', async ({ page }) => {
  await abrirModal(page, 'Agendar retorno');
  await page.getByRole('dialog').getByRole('button', { name: /selecione/i }).click();

  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  // Se amanhã cai no mês seguinte, avança o calendário antes de escolher o dia.
  if (amanha.getDate() === 1) await page.getByRole('button', { name: /next|próximo/i }).click();
  await page.getByRole('gridcell', { name: String(amanha.getDate()), exact: true }).first().click();

  await page.getByPlaceholder(/observa|descreva/i).fill('Retorno agendado via Playwright');
  await page.getByRole('dialog').getByRole('button', { name: 'Agendar' }).click();

  await expect(page.getByText(/agendad/i).first()).toBeVisible({ timeout: 10_000 });
  // O calendário também é um "dialog" (popover); o que precisa fechar é o modal.
  await expect(page.getByRole('dialog', { name: 'Agendar Retorno' })).not.toBeVisible();
});

test('cancelar fecha', async ({ page }) => {
  await abrirModal(page, 'Agendar retorno');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

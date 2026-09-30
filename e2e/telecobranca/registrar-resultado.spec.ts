import { test, expect } from '@playwright/test';
import { abrirAbaRegistrar } from './ficha';

/**
 * Registrar resultado da cobrança — aba "Registrar" da ficha do cliente.
 *
 * Cobre: status disponíveis, próximo contato sugerido, data prevista na
 * promessa, alerta de fraude e o registro de fato.
 */

test('oferece todos os status de cobrança', async ({ page }) => {
  await abrirAbaRegistrar(page);
  await page.getByRole('combobox').first().click();

  for (const status of [
    'Promessa de Pagamento', 'Alega Pagamento', 'Sem Previsão de Pagamento', 'Recado',
    'Não Atende', 'Contato inexistente/inválido', 'Suspeita de Fraude', 'Devolução',
  ]) {
    await expect(page.getByRole('option', { name: status })).toBeVisible();
  }
});

test('sugere o próximo contato automaticamente', async ({ page }) => {
  await abrirAbaRegistrar(page);
  await expect(page.getByText('Próximo contato', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajustar' })).toBeVisible();
});

test('promessa de pagamento pede a data prevista', async ({ page }) => {
  await abrirAbaRegistrar(page);
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Promessa de Pagamento' }).click();

  await expect(page.getByText('Data prevista de pagamento *', { exact: true })).toBeVisible();
});

test('suspeita de fraude mostra o alerta de escalonamento', async ({ page }) => {
  await abrirAbaRegistrar(page);
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Suspeita de Fraude' }).click();

  await expect(page.getByText('Gestão de Crédito', { exact: false })).toBeVisible();
});

test('registra um recado com anotação', async ({ page }) => {
  await abrirAbaRegistrar(page);
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Recado' }).click();
  await page.getByPlaceholder('O que o cliente disse...').fill('Recado deixado via Playwright');
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByText(/registrad/i).first()).toBeVisible({ timeout: 10_000 });
});

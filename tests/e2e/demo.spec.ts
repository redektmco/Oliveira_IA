import { test, expect } from '@playwright/test';
import { chapters, frames } from '../../src/demo/script';

test.describe('demonstração guiada (/demo)', () => {
  test('percorre todos os passos sem erros e sem chamadas de rede à API', async ({ page }) => {
    const errors: string[] = [];
    const api: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (/\/api\/|supabase\.co/.test(request.url())) api.push(request.url()); });

    await page.goto('/demo?empresa=Cl%C3%ADnica%20Teste');
    await expect(page.getByRole('heading', { name: /Seu SDR de IA/ })).toBeVisible();
    await expect(page.getByLabel('Nome da empresa do cliente')).toHaveValue('Clínica Teste');

    await page.getByRole('button', { name: /Iniciar demonstração/ }).click();
    for (let i = 1; i < frames.length; i++) {
      const { c, s } = frames[i];
      await expect(page).toHaveURL(new RegExp(`#${c + 1}\\.${s + 1}$`));
      if (!chapters[c].full) await expect(page.locator('.org-switcher b')).toHaveText('Clínica Teste');
      if (i < frames.length - 1) await page.keyboard.press('ArrowRight');
    }
    await expect(page.getByRole('heading', { name: /Seu próximo.*cliente já está.*chamando/ })).toBeVisible();

    // Voltar também é instantâneo
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(new RegExp(`#${frames[frames.length - 2].c + 1}\\.${frames[frames.length - 2].s + 1}$`));

    expect(errors).toEqual([]);
    expect(api).toEqual([]);
  });

  test('elemento destacado avança o roteiro ao ser clicado', async ({ page }) => {
    await page.goto('/demo#3.1');
    await expect(page.locator('.dm-hot')).toHaveCount(1);
    await page.locator('.dm-hot').click();
    await expect(page).toHaveURL(/#3\.2$/);
    await expect(page.getByText('1ª resposta em 8s')).toBeVisible();
  });

  test('painel da apresentadora controla a tela do cliente e mostra as anotações', async ({ context }) => {
    const main = await context.newPage();
    const presenter = await context.newPage();
    await main.goto('/demo');
    await presenter.goto('/demo/apresentador');
    await expect(presenter.getByRole('heading', { name: 'Abertura', level: 1 })).toBeVisible();
    await presenter.locator('.dm-pres-ctl .primary').click();
    await presenter.locator('.dm-pres-ctl .primary').click();
    await expect(main).toHaveURL(/#2\.2$/);
    await expect(presenter.getByText('O que falar')).toBeVisible();

    await presenter.locator('.dm-pres-company input').fill('Dental Prime');
    await main.keyboard.press('ArrowRight');
    await main.keyboard.press('ArrowRight');
    await expect(main.locator('.org-switcher b')).toHaveText('Dental Prime');
  });

  test('o app real continua abrindo com o novo design', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('button', { name: 'Explorar demonstração' })).toBeVisible();
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--red').trim());
    expect(accent.toLowerCase()).toBe('#e11d48');
  });
});

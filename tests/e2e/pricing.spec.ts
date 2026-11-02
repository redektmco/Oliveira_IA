import {test,expect} from '@playwright/test';

test('plano SDR e expansão mostram os totais sem iniciar contratação',async({page})=>{
 const chargeRequests:string[]=[];
 page.on('request',request=>{if(/checkout|billing/.test(request.url()))chargeRequests.push(request.url());});
 await page.goto('/precos');
 await expect(page.getByRole('heading',{level:1})).toContainText('Mais conversas qualificadas');
 await expect(page.getByTestId('monthly-total')).toHaveText(/449/);
 await expect(page.getByTestId('first-month-total')).toHaveText(/1.239/);
 await page.getByLabel('Pacotes adicionais de capacidade').selectOption('2');
 await expect(page.getByTestId('monthly-total')).toHaveText(/747/);
 await expect(page.getByTestId('first-month-total')).toHaveText(/1.537/);
 await expect(page.locator('.v4p-capacity').first()).toContainText('1.500 leads/mês');
 await expect(page.locator('.v4p-capacity').first()).toContainText('6.000 interações');
 await page.getByRole('button',{name:'Simular Performance'}).click();
 await expect(page.getByLabel('Seu plano')).toBeFocused();
 await expect(page.getByLabel('Pacotes adicionais de capacidade')).toHaveValue('0');
 await expect(page.getByTestId('monthly-total')).toHaveText(/899/);
 await expect(page.getByTestId('first-month-total')).toHaveText(/2.389/);
 await page.getByRole('button',{name:'Simular Essencial'}).click();
 await expect(page.getByLabel('Pacotes adicionais de capacidade')).toHaveCount(0);
 await expect(page.getByTestId('monthly-total')).toHaveText(/199/);
 await expect(page.getByTestId('first-month-total')).toHaveText(/589/);
 await page.getByRole('button',{name:'Ver condições'}).click();
 await expect(page.getByTestId('monthly-total')).toHaveText('Sob consulta');
 await expect(page.getByTestId('first-month-total')).toHaveCount(0);
 expect(chargeRequests).toEqual([]);
});

test('simulação pode ser copiada e mantém condições comerciais',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.goto('/pricing');
 await page.getByLabel('Pacotes adicionais de capacidade').selectOption('1');
 await page.getByRole('button',{name:'Copiar simulação'}).click();
 await expect(page.getByRole('status')).toHaveText('Simulação copiada.');
 const text=await page.evaluate(()=>navigator.clipboard.readText());
 expect(text).toContain('598');expect(text).toContain('1.000 leads');
 expect(text).toContain('Tarifas da Meta');expect(text).toContain('sujeitos à validação comercial');
 await page.getByText('As tarifas de WhatsApp estão incluídas?',{exact:true}).click();
 await expect(page.locator('details').filter({hasText:'As tarifas de WhatsApp estão incluídas?'})).toContainText('separadas da assinatura');
});

test('página funciona em telas pequenas e tem links para o projeto existente',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/precos');
 await expect(page.locator('.v4p-table-scroll')).toBeVisible();
 for(const width of [360,768,1280]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),`overflow at ${width}`).toBe(false);
 }
 await expect(page.getByRole('link',{name:'Já sou cliente'})).toHaveAttribute('href','/app#settings/billing');
 await expect(page.getByRole('link',{name:'Explorar demonstração'})).toHaveAttribute('href','/demo');
 await expect(page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Planos e preços'})).toHaveAttribute('aria-current','page');
 expect(errors).toEqual([]);
});

test('landing encaminha para os planos propostos',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Planos e preços'}).click();
 await expect(page).toHaveURL(/\/precos$/);
 await expect(page.getByRole('heading',{name:'SDR IA',exact:true})).toBeVisible();
});

import {test,expect} from '@playwright/test';
import {CONSENT_KEY,SIMULATION_KEY,createConsent} from '../../src/marketing/consent';

test('header e políticas são compartilhados no site público',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 await page.getByRole('button',{name:'Rejeitar opcionais',exact:true}).click();
 const header=page.getByTestId('public-header');
 await expect(header).toHaveCount(1);
 const links=await header.locator('nav a').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,href:node.getAttribute('href')})));
 await header.getByRole('link',{name:'Planos e preços'}).click();
 await expect(page.getByRole('heading',{level:1})).toContainText('Mais conversas qualificadas');
 expect(await header.locator('nav a').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,href:node.getAttribute('href')})))).toEqual(links);
 await header.getByRole('link',{name:'Transparência'}).click();
 await page.getByRole('link',{name:'Política de privacidade',exact:true}).click();
 await expect(page.getByRole('heading',{level:1})).toHaveText('Política de privacidade');
 await expect(page.locator('.legal-contact').first()).toContainText('Oliveira Assessoria de Marketing Ltda.');
 await expect(page.locator('.legal-contact').first()).toContainText('53.328.793/0001-39');
 await expect(page.locator('.legal-contact').first().getByRole('link',{name:'ktm.ferramentas@v4company.com'})).toHaveAttribute('href','mailto:ktm.ferramentas@v4company.com');
 await expect(header).toHaveCount(1);
 await expect(page.getByRole('region',{name:'Escolha de cookies'})).toHaveCount(0);
});

test('não presume consentimento e só persiste a simulação após autorização',async({page})=>{
 const externalRequests:string[]=[];
 page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:4173/'))externalRequests.push(request.url());});
 await page.goto('/precos');
 await page.getByRole('button',{name:'Personalizar',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Você decide o que fica.'});
 await expect(dialog.getByRole('checkbox',{name:'Necessários',exact:false})).toBeChecked();
 await expect(dialog.getByRole('checkbox',{name:'Necessários',exact:false})).toBeDisabled();
 await expect(dialog.getByRole('checkbox',{name:'Preferências de navegação',exact:false})).not.toBeChecked();
 await page.getByRole('button',{name:'Fechar preferências de cookies'}).click();
 expect(await page.evaluate(key=>localStorage.getItem(key),CONSENT_KEY)).toBeNull();
 await page.getByRole('button',{name:'Rejeitar opcionais',exact:true}).click();
 await page.getByLabel('Seu plano').selectOption('performance');
 expect(await page.evaluate(key=>localStorage.getItem(key),SIMULATION_KEY)).toBeNull();
 await page.getByRole('button',{name:'Gerenciar cookies',exact:true}).click();
 await dialog.getByRole('checkbox',{name:'Preferências de navegação',exact:false}).check();
 await dialog.getByRole('button',{name:'Salvar preferências'}).click();
 await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),SIMULATION_KEY)).not.toBeNull();
 await page.getByLabel('Pacotes adicionais de capacidade').selectOption('2');
 await expect(page.getByTestId('monthly-total')).toHaveText(/1.197/);
 await page.reload();
 await expect(page.getByLabel('Seu plano')).toHaveValue('performance');
 await expect(page.getByLabel('Pacotes adicionais de capacidade')).toHaveValue('2');
 await page.evaluate(()=>localStorage.setItem('oliveira-ia-demo-v1','keep-demo'));
 await page.getByRole('button',{name:'Gerenciar cookies',exact:true}).click();
 await dialog.getByRole('button',{name:'Rejeitar opcionais',exact:true}).click();
 expect(await page.evaluate(key=>localStorage.getItem(key),SIMULATION_KEY)).toBeNull();
 expect(await page.evaluate(()=>localStorage.getItem('oliveira-ia-demo-v1'))).toBe('keep-demo');
 const choice=JSON.parse((await page.evaluate(key=>localStorage.getItem(key),CONSENT_KEY))!);
 expect(choice.preferences).toBe(false);expect(choice.marketing).toBe(false);expect(choice.analytics).toBe(false);
 expect(externalRequests).toEqual([]);
});

test('escolha expirada exige novo aceite e limpa só a preferência opcional',async({page})=>{
 await page.goto('/precos');
 await page.getByRole('button',{name:'Aceitar opcionais',exact:true}).click();
 await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),SIMULATION_KEY)).not.toBeNull();
 await page.evaluate(key=>{const consent=JSON.parse(localStorage.getItem(key)!);consent.expiresAt=new Date(Date.now()-1).toISOString();localStorage.setItem(key,JSON.stringify(consent));},CONSENT_KEY);
 await page.reload();
 await expect(page.getByRole('region',{name:'Escolha de cookies'})).toBeVisible();
 await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),SIMULATION_KEY)).toBeNull();
});

test('políticas têm navegação acessível e não estouram em telas pequenas',async({page})=>{
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:CONSENT_KEY,value:JSON.stringify(createConsent(false))});
 await page.setViewportSize({width:360,height:800});
 for(const slug of ['legal','privacidade','lgpd','cookies','reembolso','termos-de-uso']){
  await page.goto('/'+slug);
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),slug).toBe(true);
 }
 await page.goto('/cookies');
 await page.getByRole('button',{name:'Abrir preferências de cookies'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.getByRole('button',{name:'Abrir menu do site'}).click();
 await expect(page.getByRole('navigation',{name:'Navegação principal do site'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('button',{name:'Abrir menu do site'})).toBeFocused();
 await page.getByRole('button',{name:'Abrir menu do site'}).click();
 await page.getByRole('navigation',{name:'Navegação principal do site'}).getByRole('link',{name:'Planos e preços'}).click();
 await expect(page).toHaveURL(/\/precos$/);
});

test('header, rodapé e banner públicos não aparecem no app nem na demonstração',async({page})=>{
 await page.goto('/app');
 await expect(page.getByRole('button',{name:'Explorar demonstração',exact:true})).toBeVisible();
 await expect(page.getByTestId('public-header')).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Escolha de cookies'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Gerenciar cookies',exact:true})).toHaveCount(0);
 await page.goto('/demo');
 await expect(page.getByRole('heading',{name:/Seu SDR de IA/})).toBeVisible();
 await expect(page.getByTestId('public-header')).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Escolha de cookies'})).toHaveCount(0);
});

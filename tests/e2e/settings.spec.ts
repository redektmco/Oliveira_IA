import {test,expect} from '@playwright/test';
async function demo(page:import('@playwright/test').Page){await page.goto('/');await page.getByRole('button',{name:'Explorar demonstração'}).click();}
test('settings tabs save workspace identity and show honest integration states',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await demo(page);await page.locator('.sidebar nav').getByRole('button',{name:'Configurações',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Geral',exact:true})).toBeVisible();await page.getByLabel('Nome do workspace',{exact:true}).fill('Operação comercial E2E');await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();await expect(page.getByRole('status').getByText('Alterações salvas.')).toBeVisible();await expect(page.locator('.org-switcher')).toContainText('Operação comercial E2E');
 await page.reload();await expect(page.getByLabel('Nome do workspace',{exact:true})).toHaveValue('Operação comercial E2E');
 await page.screenshot({path:testInfo.outputPath('settings-general-desktop.png'),fullPage:true});
 for(const [label,title]of [['Equipe','Pessoas'],['Faturamento','Plano atual'],['WhatsApp','Conexão do número'],['E-mail','Google Workspace'],['Instagram','Conta comercial'],['Widget do site','Aparência'],['API e webhooks','Chaves de API'],['Segurança','Acesso e autenticação']]){
  await page.locator('.settings-nav').getByRole('link',{name:label,exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
 }
 await page.locator('.settings-nav').getByRole('link',{name:'WhatsApp',exact:true}).click();await expect(page.getByRole('button',{name:'Gerar QR code',exact:true})).toBeDisabled();await expect(page.getByText('Conexão a verificar',{exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:testInfo.outputPath('settings-whatsapp-mobile.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
test('contact profile retains new notes and member assignment controls',async({page},testInfo)=>{
 await demo(page);await page.goto('/#contacts/demo-contact');await expect(page.getByRole('heading',{name:'Contato de exemplo',exact:true})).toBeVisible();
 await page.getByLabel('Nota interna',{exact:true}).fill('Precisa de atendimento fora do horário comercial.');await page.getByRole('button',{name:'Salvar nota',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Nota salva.');
 await page.getByRole('tab',{name:'Notas',exact:true}).click();await expect(page.locator('.profile-notes')).toContainText('Precisa de atendimento fora do horário comercial.');
 await page.getByRole('combobox',{name:'Atribuir responsável',exact:true}).selectOption('demo');
 await page.reload();await expect(page.getByRole('combobox',{name:'Atribuir responsável',exact:true})).toHaveValue('demo');await page.getByRole('tab',{name:'Notas',exact:true}).click();await expect(page.locator('.profile-notes')).toContainText('Precisa de atendimento fora do horário comercial.');
 await page.screenshot({path:testInfo.outputPath('contact-profile-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('contact-profile-mobile.png'),fullPage:true});
});

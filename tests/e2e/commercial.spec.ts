import { test, expect, type Page } from '@playwright/test';
import {emptyState, type Agent} from '../../src/lib/types';

async function enterDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', {name: 'Explorar demonstração'}).click();
  await expect(page.getByText('Demonstração', {exact: true}).first()).toBeVisible();
}
async function navigate(page: Page, name: string) {
  await page.locator('nav').getByRole('button', {name, exact:true}).click();
}
async function restoreDemo(page: Page) {
  await page.reload();
  const demoButton = page.getByRole('button', {name: 'Explorar demonstração'});
  await expect(demoButton.or(page.locator('.demo-banner'))).toBeVisible();
  if (await demoButton.isVisible()) await demoButton.click();
}

test('Felipa substitui a identidade antiga sem apagar os dados de uma demonstração salva', async ({page}) => {
  const oldAgent: Agent = {id:'demo-agent', name:'Ana SDR', company:'Oliveira & Co.', system_prompt:'Instruções aprovadas.', greeting:'Olá! Sou a Ana, assistente virtual da Oliveira & Co. Como posso ajudar?', model:'claude-haiku-4-5-20251001', active:true, qualification_threshold:75, created_at:new Date().toISOString()};
  await page.addInitScript(({oldAgent,state}) => {
    if (!localStorage.getItem('oliveira-ia-demo-v1')) localStorage.setItem('oliveira-ia-demo-v1', JSON.stringify({...state, agents:[oldAgent, {...oldAgent,id:'custom-agent',name:'Minha agente',greeting:'Apresentação personalizada.'}]}));
  }, {oldAgent,state:emptyState()});
  await enterDemo(page);
  await navigate(page,'Agentes de IA');
  await expect(page.getByRole('heading',{name:'Felipa',exact:true})).toBeVisible();
  await expect(page.getByText('Olá! Sou a Felipa, assistente virtual da Oliveira & Co. Como posso ajudar?',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Minha agente',exact:true})).toBeVisible();
  await expect(page.getByText('Apresentação personalizada.',{exact:true})).toBeVisible();
  await restoreDemo(page);
  await expect(page.getByRole('heading',{name:'Felipa',exact:true})).toBeVisible();
});

test('contato, oportunidade e mudança de etapa persistem no modo local', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await enterDemo(page);
  await navigate(page, 'Contatos');
  await page.getByRole('button', {name:'+ Novo contato', exact:true}).click();
  const dialog = page.getByRole('dialog', {name:'Novo contato'});
  await dialog.getByLabel('Nome *', {exact:true}).fill('Lead de teste E2E');
  await dialog.getByLabel('Empresa', {exact:true}).fill('Empresa E2E');
  await dialog.getByLabel('E-mail', {exact:true}).fill('lead@example.com');
  await dialog.getByLabel('Score de qualificação').fill('80');
  await dialog.getByRole('combobox', {name:'Status', exact:true}).selectOption('qualified');
  await dialog.getByRole('button', {name:'Salvar contato'}).click();
  await expect(page.getByText('Contato criado.', {exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Editar Lead de teste E2E', exact:true}).click();
  await page.getByRole('dialog').getByLabel('Notas comerciais').fill('Necessidade confirmada durante teste.');
  await page.getByRole('dialog').getByRole('button', {name:'Salvar contato'}).click();
  await restoreDemo(page);
  await navigate(page, 'Contatos');
  await expect(page.getByText('Lead de teste E2E', {exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Editar Lead de teste E2E', exact:true}).click();
  await expect(page.getByRole('dialog').getByLabel('Notas comerciais')).toHaveValue('Necessidade confirmada durante teste.');
  await page.getByRole('dialog').getByRole('button', {name:'Cancelar',exact:true}).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name:'Exportar CSV'}).click();
  expect((await download).suggestedFilename()).toMatch(/^contatos-.*\.csv$/);
  await navigate(page, 'Pipeline de vendas');
  await page.getByRole('button', {name:'+ Nova oportunidade',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Título *', {exact:true}).fill('Implantação E2E');
  await page.getByRole('dialog').getByRole('combobox', {name:'Contato', exact:true}).selectOption({label:'Lead de teste E2E · Empresa E2E'});
  await page.getByRole('dialog').getByLabel('Valor (R$) *', {exact:true}).fill('12000');
  await page.getByRole('dialog').getByRole('button', {name:'Salvar oportunidade'}).click();
  await page.getByLabel('Etapa de Implantação E2E').selectOption('qualified');
  await expect(page.getByText('Oportunidade movida para Qualificado.', {exact:true})).toBeVisible();
  await expect(page.getByRole('region', {name:'Qualificado',exact:true}).getByText('Implantação E2E', {exact:true})).toBeVisible();
  await restoreDemo(page);
  await navigate(page, 'Pipeline de vendas');
  await expect(page.getByLabel('Etapa de Implantação E2E')).toHaveValue('qualified');
  expect(errors).toEqual([]);
});

test('agente e conhecimento salvos não simulam respostas do Claude', async ({page}) => {
  let chatCalls = 0;
  page.on('request', request => {if (request.url().endsWith('/api/chat')) chatCalls++;});
  await enterDemo(page);
  await navigate(page, 'Agentes de IA');
  await page.getByRole('button', {name:'+ Criar agente',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Nome do agente', {exact:true}).fill('Assistente E2E');
  await page.getByRole('dialog').getByLabel('Empresa representada').fill('Empresa E2E');
  await page.getByRole('dialog').getByRole('button', {name:'Salvar agente'}).click();
  await expect(page.getByRole('heading', {name:'Assistente E2E',exact:true})).toBeVisible();
  await navigate(page, 'Base de conhecimento');
  await page.getByRole('button', {name:'+ Adicionar conteúdo',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Título', {exact:true}).fill('FAQ E2E');
  await page.getByRole('dialog').getByLabel(/^Conteúdo/).fill('Os planos de serviço são apresentados após diagnóstico comercial.');
  await page.getByRole('dialog').getByRole('button', {name:'Salvar conteúdo'}).click();
  await restoreDemo(page);
  await navigate(page, 'Base de conhecimento');
  await expect(page.getByRole('heading', {name:'FAQ E2E',exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Editar conteúdo',exact:true}).click();
  await page.getByRole('dialog').getByLabel(/^Conteúdo/).fill('FAQ revisado com condições comerciais aprovadas.');
  await page.getByRole('dialog').getByRole('button', {name:'Salvar conteúdo'}).click();
  await expect(page.getByText('FAQ revisado com condições comerciais aprovadas.', {exact:true})).toBeVisible();
  await navigate(page, 'Playground');
  await page.getByLabel('Agente ativo').selectOption({label:'Assistente E2E'});
  await page.getByLabel('Mensagem de teste').fill('Gostaria de contratar o serviço.');
  await expect(page.getByRole('button', {name:'Enviar ao Claude'})).toBeDisabled();
  await expect(page.getByText('Modo demonstração: configure Supabase e a API Anthropic para receber respostas reais.')).toBeVisible();
  expect(chatCalls).toBe(0);
});

test('reuniões permitem edição, exportação ICS e exclusão', async ({page}) => {
  await enterDemo(page);
  await navigate(page, 'Reuniões');
  await page.getByRole('button', {name:'+ Agendar reunião',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Título *', {exact:true}).fill('Diagnóstico E2E');
  await page.getByRole('dialog').getByLabel('Local ou link da reunião').fill('Escritório');
  await page.getByRole('dialog').getByRole('button', {name:'Salvar reunião'}).click();
  const meeting = page.locator('article').filter({has:page.getByRole('heading', {name:'Diagnóstico E2E',exact:true})});
  await expect(meeting).toBeVisible();
  const download = page.waitForEvent('download');
  await meeting.getByRole('button', {name:'Baixar .ics'}).click();
  expect((await download).suggestedFilename()).toBe('reuniao.ics');
  await meeting.getByRole('button', {name:'Editar',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Título *', {exact:true}).fill('Diagnóstico E2E atualizado');
  await page.getByRole('dialog').getByRole('button', {name:'Salvar reunião'}).click();
  await expect(page.getByRole('heading', {name:'Diagnóstico E2E atualizado',exact:true})).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('article').filter({has:page.getByRole('heading', {name:'Diagnóstico E2E atualizado',exact:true})}).getByRole('button', {name:'Excluir',exact:true}).click();
  await expect(page.getByRole('heading', {name:'Diagnóstico E2E atualizado',exact:true})).toHaveCount(0);
});

test('menu móvel abre e navega sem overflow global', async ({page}, testInfo) => {
  await page.setViewportSize({width:390,height:844});
  await enterDemo(page);
  await page.getByRole('button', {name:'Abrir menu',exact:true}).click();
  await navigate(page, 'Contatos');
  await expect(page.getByRole('heading', {name:'Contatos',exact:true})).toBeVisible();
  await expect(page.locator('.sidebar')).not.toHaveClass(/mobile-open/);
  await expect(page.getByRole('button', {name:'Fechar menu',exact:true})).not.toBeInViewport();
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(noOverflow).toBe(true);
  await page.screenshot({path:testInfo.outputPath('mobile.png'),fullPage:true});
});


test('conversa interna preserva histórico humano, encerramento e retomada', async ({page}) => {
  await enterDemo(page);
  await navigate(page, 'Caixa de entrada');
  await page.getByRole('button', {name:'Nova conversa',exact:true}).click();
  await page.getByRole('dialog').getByRole('button', {name:'Criar conversa',exact:true}).click();
  await expect(page.getByRole('button', {name:'Enviar ao agente',exact:true})).toBeDisabled();
  await page.getByRole('button', {name:'Assumir como humano',exact:true}).click();
  await page.getByLabel('Sua resposta como atendente').fill('Olá, vamos conversar sobre sua necessidade.');
  await page.getByRole('button', {name:'Registrar resposta',exact:true}).click();
  await expect(page.locator('.ai-chat-bubble').getByText('Olá, vamos conversar sobre sua necessidade.', {exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Encerrar',exact:true}).click();
  await expect(page.getByLabel('Mensagem do cliente de teste')).toBeDisabled();
  await page.getByRole('button', {name:'Retomar IA',exact:true}).click();
  await expect(page.getByRole('button', {name:'Enviar ao agente',exact:true})).toBeDisabled();
  await restoreDemo(page);
  await navigate(page, 'Caixa de entrada');
  await page.locator('.ai-conversation-item').first().click();
  await expect(page.locator('.ai-chat-bubble').getByText('Olá, vamos conversar sobre sua necessidade.', {exact:true})).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:'Excluir',exact:true}).click();
  await expect(page.locator('.ai-conversation-item')).toHaveCount(0);
});

import SettingsHub from '../settings/SettingsHub';
import { useEffect, useState } from 'react';
import { useWorkspace } from '../lib/workspace';
import { Badge, Button, PageHeader } from '../components/ui';
import { supabase } from '../lib/supabase';

export default function Settings({section = 'settings'}: {section?: string}) {
  const {data, demo} = useWorkspace();
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [failure, setFailure] = useState(false);
  const [whatsapp, setWhatsapp] = useState<{instance: string; state: string; connected: boolean; messagingEnabled?:boolean} | null>(null);
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [whatsappError, setWhatsappError] = useState('');
  const checkWhatsapp = async () => {
    if (demo || whatsappBusy) return;
    setWhatsappBusy(true); setWhatsappError(''); setWhatsapp(null);
    try {
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error('Entre na sua conta para verificar a conexão.');
      const response = await fetch('/api/whatsapp-status', {headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(30_000)});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Não foi possível verificar a conexão.');
      if (typeof result.connected !== 'boolean' || typeof result.instance !== 'string') throw new Error('O servidor retornou um status inválido.');
      setWhatsapp(result);
    } catch (error) { setWhatsappError(error instanceof Error ? error.message : 'Não foi possível verificar a conexão.'); }
    finally { setWhatsappBusy(false); }
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', {signal: controller.signal}).then(async r => {if (!r.ok) throw new Error(); return r.json();}).then(setHealth).catch(e => {if (e.name !== 'AbortError') setFailure(true);});
    return () => controller.abort();
  }, []);
  if (section === 'usage') {
    const completed = data.ai_usage.filter(u => u.status === 'completed');
    return <div className="content"><PageHeader title="Uso da inteligência artificial" description="Consumo registrado nas chamadas do Claude desta conta."/>
      <div className="metric-grid">{[['Chamadas concluídas', completed.length],['Tokens de entrada',completed.reduce((a,u) => a + u.input_tokens,0)],['Tokens de saída',completed.reduce((a,u) => a + u.output_tokens,0)],['Falhas', data.ai_usage.filter(u => u.status === 'failed').length]].map(([label,value]) => <div className="card metric-card" key={label}><div className="metric-label">{label}</div><div className="metric-value">{Number(value).toLocaleString('pt-BR')}</div></div>)}</div>
      <div className="notice-box section-space">A cobrança da API é feita pela Anthropic. O valor depende do modelo e dos tokens usados. O limite diário de chamadas é configurado no servidor; os limites de gasto devem ser definidos também no console Anthropic.</div>
      <div className="table-card"><table><thead><tr><th>DATA</th><th>MODELO</th><th>ENTRADA</th><th>SAÍDA</th><th>ESTADO</th></tr></thead><tbody>{[...data.ai_usage].reverse().map(u => <tr key={u.id}><td>{new Date(u.created_at).toLocaleString('pt-BR')}</td><td>{u.model}</td><td>{u.input_tokens}</td><td>{u.output_tokens}</td><td><Badge tone={u.status === 'completed' ? 'success' : u.status === 'failed' ? 'danger' : 'warning'}>{u.status === 'completed' ? 'Concluído' : u.status === 'failed' ? 'Falhou' : 'Pendente'}</Badge></td></tr>)}</tbody></table>{!data.ai_usage.length && <div className="empty-state">Ainda não há chamadas registradas.</div>}</div>
    </div>;
  }
  if (section === 'settings') return <SettingsHub/>;
  return <div className="content"><PageHeader title={section === 'integrations' ? 'Integrações' : 'Configurações'} description="Conexões e requisitos da sua operação comercial."/>
    <div className="setup-grid">
      <div className="card setup-card"><div className="setup-title"><b>Claude · Anthropic</b><Badge tone={demo ? 'warning' : 'info'}>{demo ? 'Demonstração' : 'Consulte o status abaixo'}</Badge></div><p>Os agentes usam a API da Anthropic pelo servidor. Sua chave fica nas variáveis privadas da Vercel.</p><ul><li>ANTHROPIC_API_KEY com créditos disponíveis.</li><li>Agente ativo com instruções e modelo configurados.</li><li>Limite padrão: 50 tentativas por conta/dia.</li></ul></div>
      <div className="card setup-card"><div className="setup-title"><b>Supabase</b><Badge tone={demo ? 'warning' : 'success'}>{demo ? 'Modo local' : 'Sessão conectada'}</Badge></div><p>Login por e-mail e senha. Dados protegidos por políticas de acesso por usuário.</p><p>Cada conta tem seu espaço isolado. Compartilhamento entre membros e gestão de várias empresas ficam para uma etapa posterior.</p></div>
      <div className="card setup-card"><div className="setup-title"><b>WhatsApp · Evolution</b><Badge tone={whatsapp?.connected ? 'success' : 'warning'}>{whatsapp?.connected ? 'Instância conectada' : whatsapp?.state === 'connecting' ? 'Conectando' : whatsapp ? 'Instância desconectada' : 'A verificar'}</Badge></div><p>Consulte a conexão do número na Evolution. A chave privada permanece no servidor.</p><p>{whatsapp?.messagingEnabled ? 'Ponte ativa: mensagens chegam à Caixa de entrada. A IA responde apenas aos números autorizados; os demais seguem para atendimento humano.' : 'A ponte de mensagens ainda não foi ativada. Verifique a conexão para consultar o estado atual.'}</p>{whatsapp && <p>Instância: <b>{whatsapp.instance}</b></p>}{demo && <p>Entre na sua conta para verificar o número.</p>}{whatsappError && <p className="form-error" role="alert">{whatsappError}</p>}<Button onClick={() => { void checkWhatsapp(); }} disabled={demo || whatsappBusy}>{whatsappBusy ? 'Verificando...' : 'Verificar conexão'}</Button></div>
      <div className="card setup-card"><div className="setup-title"><b>Agenda e CRM externo</b><Badge>Próxima etapa</Badge></div><p>Contatos, pipeline e reuniões funcionam no painel. Exporte contatos em CSV e reuniões em ICS.</p><p>Google Calendar, HubSpot, Pipedrive e cobranças não estão conectados nesta versão. A aplicação não cria links do Google Meet.</p></div>
    </div><div className="card setup-card section-space"><div className="setup-title"><b>Verificação do servidor</b><Button onClick={() => window.location.reload()}>Atualizar</Button></div>
      {failure ? <p role="alert">Não foi possível consultar o servidor. Confira se a aplicação foi iniciada com a API.</p> : !health ? <p>Consultando a configuração…</p> : <div className="health-items">{Object.entries((health.configured || {}) as Record<string, boolean>).map(([name, configured]) => <div className="setup-title" key={name}><span>{name === 'supabase' ? 'Autenticação e acesso ao Supabase' : name === 'database' ? 'Credencial privada do banco' : name === 'anthropic' ? 'Credencial do Claude' : name}</span><Badge tone={configured ? 'success' : 'warning'}>{configured ? 'Configurado' : 'Pendente'}</Badge></div>)}</div>}
      <p>Este status indica presença de configuração. Uma chamada bem-sucedida no Playground valida a conexão real com o Claude.</p>
    </div></div>;
}

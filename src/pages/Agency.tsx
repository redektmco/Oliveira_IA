import {useState,type FormEvent} from 'react';
import {Badge,PageHeader} from '../components/ui';
import {useWorkspace} from '../lib/workspace';
import {Dialog,Field,copy,dateTime,usePanelData} from '../settings/shared';
import '../settings/settings.css';

type ClientWorkspace={
 ownerId:string;name:string;email:string;createdAt:string;status:'active'|'invited';lastSignInAt:string|null;members:number;joined:boolean;
 limits:{windowUsd:number|null;dailyUsd:number|null};today:{chatUsd:number|null;otherUsd:number|null;calls:number};
};
type ListResult={workspaces:ClientWorkspace[];defaults:{windowUsd:number|null;dailyUsd:number|null}};
const money=(v:number|null|undefined)=>`US$ ${(v??0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

/** Painel da agência: um workspace isolado por cliente. Visível só para PLATFORM_ADMIN_EMAILS. */
export default function Agency(){
 const {api,platformAdmin,switchWorkspace,demo}=useWorkspace();
 const {data,error,reload}=usePanelData<ListResult>(()=>platformAdmin?api('platform.list'):Promise.resolve({workspaces:[],defaults:{windowUsd:null,dailyUsd:null}}),[api,platformAdmin]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState('');
 const [dialog,setDialog]=useState<null|'create'|'attach'|{limits:ClientWorkspace}|{link:{url:string;email:string;title:string}}>(null);
 const [form,setForm]=useState({name:'',email:'',contactName:'',windowUsd:'',dailyUsd:''});
 const run=async(task:()=>Promise<void>)=>{setBusy(true);setFailure('');setMessage('');try{await task();}catch(e){setFailure(e instanceof Error?e.message:'Não foi possível concluir.');}finally{setBusy(false);}};
 const enter=(w:ClientWorkspace)=>void run(async()=>{if(!w.joined)await api('platform.join',{ownerId:w.ownerId});switchWorkspace(w.ownerId,true);window.location.hash='overview';});
 const close=()=>{if(!busy){setDialog(null);setForm({name:'',email:'',contactName:'',windowUsd:'',dailyUsd:''});}};

 if(demo||!platformAdmin)return <div className="content"><PageHeader title="Clientes da agência"/><div className="empty-state">Esta área é exclusiva da equipe da agência.</div></div>;

 const create=(e:FormEvent)=>{e.preventDefault();void run(async()=>{
  const r=await api<{ownerId:string;emailSent:boolean;url:string|null}>('platform.create',{name:form.name,email:form.email,contactName:form.contactName});
  reload();
  if(r.url)setDialog({link:{url:r.url,email:form.email,title:'Workspace criado: envie o link ao cliente'}});
  else{setDialog(null);setMessage(`Workspace “${form.name}” criado. O convite foi enviado para ${form.email}.`);}
  setForm(f=>({...f,name:'',email:'',contactName:''}));
 });};
 const attach=(e:FormEvent)=>{e.preventDefault();void run(async()=>{await api('platform.attach',{email:form.email,name:form.name});reload();setDialog(null);setMessage('Conta adicionada ao painel da agência.');});};
 const saveLimits=(e:FormEvent,w:ClientWorkspace)=>{e.preventDefault();void run(async()=>{
  const value=(v:string)=>v.trim()===''?null:Number(v.replace(',','.'));
  await api('platform.limits',{ownerId:w.ownerId,windowUsd:value(form.windowUsd),dailyUsd:value(form.dailyUsd)});reload();setDialog(null);setMessage(`Limites de “${w.name}” atualizados.`);
 });};
 const link=(w:ClientWorkspace)=>void run(async()=>{const r=await api<{url:string;email:string}>('platform.link',{ownerId:w.ownerId});setDialog({link:{...r,title:`Link de acesso de ${w.name}`}});});
 const defaults=data?.defaults;

 return <div className="content settings-page">
  <PageHeader title="Clientes da agência" description="Cada cliente tem um workspace isolado: ele só vê os próprios contatos, conversas, equipe e configurações. A agência entra por aqui sem aparecer na equipe do cliente.">
   <button className="btn" disabled={busy} onClick={()=>setDialog('attach')}>Adicionar conta existente</button>
   <button className="btn btn-primary" disabled={busy} onClick={()=>setDialog('create')}>+ Novo cliente</button>
  </PageHeader>
  {(error||failure)&&<div role="alert" className="crm-error">{failure||error}</div>}
  {message&&<div role="status" className="settings-info">{message}</div>}
  <div className="table-card"><table><thead><tr><th>CLIENTE</th><th>ACESSO</th><th>EQUIPE</th><th>IA HOJE</th><th>LIMITE DO CHAT</th><th>AÇÕES</th></tr></thead><tbody>
   {data?.workspaces.map(w=><tr key={w.ownerId}>
    <td><b>{w.name}</b><small className="settings-muted" style={{display:'block'}}>{w.email}</small></td>
    <td>{w.status==='active'?<Badge tone="success">Ativo</Badge>:<Badge tone="warning">Convite pendente</Badge>}<small className="settings-muted" style={{display:'block'}}>{w.lastSignInAt?`Último acesso ${dateTime(w.lastSignInAt)}`:`Criado ${dateTime(w.createdAt)}`}</small></td>
    <td>{w.members} {w.members===1?'pessoa':'pessoas'}</td>
    <td>Chat {money(w.today.chatUsd)}<small className="settings-muted" style={{display:'block'}}>SDR e outros {money(w.today.otherUsd)}</small></td>
    <td>{w.limits.windowUsd||w.limits.dailyUsd?<Badge tone="info">Personalizado</Badge>:<Badge>Padrão</Badge>}<small className="settings-muted" style={{display:'block'}}>{money(w.limits.windowUsd??defaults?.windowUsd)}/5h · {money(w.limits.dailyUsd??defaults?.dailyUsd)}/dia por pessoa</small></td>
    <td><div className="settings-inline">
     <button className="btn btn-primary" disabled={busy} onClick={()=>enter(w)}>Entrar</button>
     <button className="btn" disabled={busy} onClick={()=>{setForm(f=>({...f,windowUsd:w.limits.windowUsd?.toString()??'',dailyUsd:w.limits.dailyUsd?.toString()??''}));setDialog({limits:w});}}>Limites</button>
     <button className="btn btn-ghost" disabled={busy} onClick={()=>link(w)}>Link de acesso</button>
    </div></td>
   </tr>)}
  </tbody></table>{data&&!data.workspaces.length&&<div className="empty-state">Nenhum cliente ainda. Clique em <b>+ Novo cliente</b> para criar o primeiro workspace.</div>}{!data&&!error&&<div className="empty-state">Carregando clientes…</div>}</div>

  {dialog==='create'&&<Dialog title="Novo cliente" onClose={close} onSubmit={create} submitLabel="Criar workspace" busy={busy}>
   <p>Cria um workspace vazio e isolado para o cliente. Ele recebe um e-mail para definir a senha e só verá o próprio workspace. Você continua com acesso pelo botão <b>Entrar</b>.</p>
   <Field label="Nome da empresa do cliente"><input required maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: Clínica Sorriso"/></Field>
   <Field label="E-mail de acesso do cliente"><input required type="email" maxLength={254} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="dono@cliente.com.br"/></Field>
   <Field label="Nome da pessoa (opcional)"><input maxLength={120} value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})}/></Field>
  </Dialog>}
  {dialog==='attach'&&<Dialog title="Adicionar conta existente" onClose={close} onSubmit={attach} submitLabel="Adicionar" busy={busy}>
   <p>Para clientes que já criaram conta antes. O workspace dessa conta passa a aparecer neste painel e você ganha acesso oculto a ele. Os dados do cliente não são alterados.</p>
   <Field label="E-mail da conta do cliente"><input required type="email" maxLength={254} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field>
   <Field label="Nome do cliente (opcional)"><input maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
  </Dialog>}
  {dialog&&typeof dialog==='object'&&'limits' in dialog&&<Dialog title={`Limites do chat · ${dialog.limits.name}`} onClose={close} onSubmit={e=>saveLimits(e,dialog.limits)} busy={busy}>
   <p>Valem para o Assistente da tela inicial e o Playground, <b>por pessoa</b>. O cliente vê apenas a porcentagem usada. O SDR IA não tem limite. Deixe em branco para usar o padrão ({money(defaults?.windowUsd)} por sessão de 5h e {money(defaults?.dailyUsd)} por dia). Com Haiku, um pedido ao assistente custa em média de US$ 0,01 a US$ 0,05.</p>
   <div className="settings-form-grid">
    <Field label="Por sessão de 5 horas (US$)"><input inputMode="decimal" value={form.windowUsd} onChange={e=>setForm({...form,windowUsd:e.target.value})} placeholder={String(defaults?.windowUsd??'')}/></Field>
    <Field label="Por dia (US$)"><input inputMode="decimal" value={form.dailyUsd} onChange={e=>setForm({...form,dailyUsd:e.target.value})} placeholder={String(defaults?.dailyUsd??'')}/></Field>
   </div>
  </Dialog>}
  {dialog&&typeof dialog==='object'&&'link' in dialog&&<Dialog title={dialog.link.title} onClose={close}>
   <p>Envie este link para <b>{dialog.link.email}</b> (WhatsApp ou e-mail). Ao abrir, o cliente define a senha e entra direto no workspace dele. O link é de uso único; gere outro se expirar.</p>
   <code className="settings-code">{dialog.link.url}</code>
   <button type="button" className="btn btn-primary" onClick={()=>void run(async()=>{await copy(dialog.link.url);setMessage('Link copiado.');})}>Copiar link</button>
  </Dialog>}
 </div>;
}

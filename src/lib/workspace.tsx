import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {supabase} from './supabase';
import {setAuthNotice} from './auth-notice';
import {deleteDemoRow,loadDemo,saveDemo} from './demo';
import {emptyState,type DatabaseState,type EditableTable,type RowInput,type Tables} from './types';
import {defaultSettings,mergeSettings,type WorkspaceSettings,type WorkspaceRole} from './settings-types';
import type {Workflow} from './workflow-types';
export type ChatRequest={agentId:string;conversationId?:string;message:string;history?:{role:'user'|'assistant';content:string}[]};
export type ChatResult={text:string;usage:{input_tokens:number;output_tokens:number};conversationId?:string};
type WorkspaceInfo={id:string;name:string;role:WorkspaceRole};
interface Workspace{
 data:DatabaseState;demo:boolean;loading:boolean;error:string|null;ownerId:string;userId:string;role:WorkspaceRole;workspaceName:string;logo:string;phoneFormat:string;workspaces:WorkspaceInfo[];
 refresh:(silent?:boolean)=>Promise<void>;api:<T=any>(action:string,input?:Record<string,unknown>)=>Promise<T>;switchWorkspace:(id:string)=>void;
 create:<K extends EditableTable>(table:K,input:RowInput<K>)=>Promise<Tables[K]>;
 update:<K extends EditableTable>(table:K,id:string,patch:Partial<RowInput<K>>)=>Promise<void>;remove:(table:EditableTable,id:string)=>Promise<void>;askClaude:(request:ChatRequest)=>Promise<ChatResult>;
}
export class ApiError extends Error{constructor(message:string,public readonly status:number){super(message);this.name='ApiError';}}
const Context=createContext<Workspace|null>(null);
/** Mirrors the database deal triggers so the local demonstration shows a real timeline. */
function demoDealEvents(data:DatabaseState,before:Tables['deals']|undefined,patch:Partial<Tables['deals']>,now:string):DatabaseState{
 if(!before)return data;const events:Tables['deal_events'][]=[];const add=(kind:Tables['deal_events']['kind'],detail:Record<string,unknown>)=>events.push({id:crypto.randomUUID(),deal_id:before.id,kind,detail,actor_id:'demo',created_at:now});
 if(patch.stage!==undefined&&patch.stage!==before.stage)add('stage',{from:before.stage,to:patch.stage,reason:patch.stage==='lost'?patch.lost_reason??before.lost_reason??'':''});
 if(patch.value!==undefined&&patch.value!==before.value)add('value',{from:before.value,to:patch.value});
 if(patch.assigned_to!==undefined&&patch.assigned_to!==before.assigned_to)add('owner',{from:before.assigned_to??null,to:patch.assigned_to});
 if(patch.close_date!==undefined&&patch.close_date!==before.close_date)add('close_date',{from:before.close_date??null,to:patch.close_date});
 const deals=data.deals.map(d=>d.id!==before.id?d:{...d,updated_at:now,...(patch.stage!==undefined&&patch.stage!==before.stage?{stage_changed_at:now,closed_at:['won','lost'].includes(patch.stage)?now:null}:{})});
 return {...data,deals,deal_events:[...data.deal_events,...events]};
}
/** Demonstração: automações ficam no navegador e nunca executam ações. */
function demoWorkflows(action:string,input:Record<string,unknown>){
 const key='oliveira-workflows-demo-v1';let list:Workflow[]=[];try{list=JSON.parse(localStorage.getItem(key)||'[]');}catch{}
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(list));}catch{throw new Error('O navegador não permitiu salvar a automação.');}};
 const find=(id=input.id)=>{const w=list.find(x=>x.id===id);if(!w)throw new Error('Automação não encontrada.');return w;};
 if(action==='workflows.list')return {available:true,workflows:list,runs:[]};
 if(action==='workflows.get')return {workflow:find(),runs:[]};
 if(action==='workflows.save'){const v=input.workflow as Workflow,now=new Date().toISOString();if(!v?.name?.trim())throw new Error('Nome da automação: preencha este campo.');
  if(v.id){const w=find(v.id);Object.assign(w,{name:v.name,description:v.description,trigger:v.trigger,steps:v.steps,updated_at:now});persist();return {workflow:w};}
  const w:Workflow={...v,id:crypto.randomUUID(),status:'draft',created_via:'panel',run_count:0,last_run_at:null,created_at:now,updated_at:now};list.unshift(w);persist();return {workflow:w};}
 if(action==='workflows.status'){const w=find();if(input.status==='active')throw new Error('Na demonstração as automações não são ativadas. Entre com sua conta.');w.status=input.status as Workflow['status'];persist();return {workflow:w};}
 if(action==='workflows.delete'){list=list.filter(x=>x.id!==input.id);persist();return {deleted:true};}
 throw new Error('Na demonstração as automações não executam ações. Entre com sua conta.');
}
export function useWorkspace(){const value=useContext(Context);if(!value)throw new Error('Workspace indisponível.');return value;}
export function WorkspaceProvider({demo,userId,children}:{demo:boolean;userId:string|null;children:ReactNode}){
 const [data,setData]=useState<DatabaseState>(()=>demo?loadDemo():emptyState()),dataRef=useRef(data);
 const [ownerId,setOwnerId]=useState(()=>{try{return sessionStorage.getItem(`oliveira-workspace-${userId}`)||userId||'demo';}catch{return userId||'demo';}}),ownerRef=useRef(ownerId);
 const [role,setRole]=useState<WorkspaceRole>('admin'),[workspaceName,setWorkspaceName]=useState('Oliveira & Co.'),[logo,setLogo]=useState(''),[phoneFormat,setPhoneFormat]=useState('international'),[workspaces,setWorkspaces]=useState<WorkspaceInfo[]>([]);
 const [loading,setLoading]=useState(!demo),[error,setError]=useState<string|null>(null),generation=useRef(0);
 const replace=useCallback((next:DatabaseState)=>{dataRef.current=next;setData(next);},[]);
 const commitDemo=(next:DatabaseState)=>{try{saveDemo(next);}catch{throw new Error('Não foi possível salvar no navegador. Libere o armazenamento e tente novamente.');}replace(next);};
 const api=useCallback(async<T=any>(action:string,input:Record<string,unknown>={}):Promise<T>=>{
  if(demo){
   const key='oliveira-settings-demo-v1';let settings:WorkspaceSettings;try{settings=mergeSettings(JSON.parse(localStorage.getItem(key)||'null'));}catch{settings=defaultSettings();}
   if(action==='settings')return {settings,accounts:[],widgetKey:'DEMONSTRACAO',capabilities:{google:false,instagram:false,stripe:false,whatsapp:false}} as T;
   if(action==='settings.save'){const section=input.section as keyof WorkspaceSettings;const next={...settings,[section]:input.value};try{localStorage.setItem(key,JSON.stringify(next));}catch{throw new Error('O navegador não permitiu salvar as configurações.');}setWorkspaceName(next.general.name);setLogo(next.general.logo);setPhoneFormat(next.general.phoneFormat);return {saved:true}as T;}
   if(action==='contact.context')return {members:[{id:'demo',user_id:'demo',name:'Visitante',role:'admin',status:'active'}],preferences:settings.general} as T;
   if(action==='team')return {members:[{id:'demo',user_id:'demo',owner_id:'demo',name:'Visitante',email:'',role:'admin',status:'active',created_at:new Date().toISOString(),owner:true}]}as T;
   if(action==='api.list')return {keys:[],webhooks:[],deliveries:[]}as T;
   if(action==='security.list')return {sessions:[],audit:[],ip:''}as T;
   if(action==='billing')return {configured:false,plans:[],invoices:[],subscription:null}as T;
   if(action==='calendar.status')return {configured:false,available:true,mine:null,calendars:[],scheduling:settings.scheduling}as T;
   if(action.startsWith('workflows.'))return demoWorkflows(action,input) as T;
   throw new Error('Entre em sua conta para usar esta funcionalidade com dados reais.');
  }
  const session=await supabase?.auth.getSession(),token=session?.data.session?.access_token;if(!token)throw new Error('Sua sessão expirou. Entre novamente.');
  const response=await fetch('/api/workspace',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Workspace-Id':ownerRef.current},body:JSON.stringify({action,...input}),signal:AbortSignal.timeout(55000)});
  const result=await response.json().catch(()=>({}));
  if(response.status===401&&supabase){
   // The server ended this session (inactivity, revocation or expiry): return to the login screen with the reason.
   setAuthNotice(result.error||'Sua sessão expirou. Entre novamente.');await supabase.auth.signOut({scope:'local'}).catch(()=>{});
  }
  if(!response.ok)throw new ApiError(result.error||'Não foi possível concluir a operação.',response.status);if(action==='settings.save'&&input.section==='general'){const general=input.value as WorkspaceSettings['general'];setWorkspaceName(general.name);setLogo(general.logo);setPhoneFormat(general.phoneFormat);}return result as T;
 },[demo]);
 const refresh=useCallback(async(silent=false)=>{
  if(demo)return;const current=++generation.current;if(!silent)setLoading(true);
  try{const result=await api<{data:DatabaseState}>('data');if(current!==generation.current)return;replace({...emptyState(),...result.data});setError(null);}catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Não foi possível carregar os dados.');throw e;}finally{if(current===generation.current)setLoading(false);}
 },[api,demo,replace]);
 const load=useCallback(async()=>{
  if(demo){try{const s=mergeSettings(JSON.parse(localStorage.getItem('oliveira-settings-demo-v1')||'null'));setWorkspaceName(s.general.name);setLogo(s.general.logo);setPhoneFormat(s.general.phoneFormat);}catch{}return;}
  setLoading(true);
  try{
   let info;
   try{info=await api('bootstrap');}catch(e){
    // A removed or disabled membership leaves a stale workspace id in this tab: fall back to the user's own workspace.
    if(e instanceof ApiError&&e.status===403&&userId&&ownerRef.current!==userId){try{sessionStorage.removeItem(`oliveira-workspace-${userId}`);}catch{}ownerRef.current=userId;setOwnerId(userId);window.dispatchEvent(new Event('oliveira-workspace-changed'));return;}
    throw e;
   }setRole(info.role);setWorkspaceName(info.workspaceName);setLogo(info.logo);setPhoneFormat(info.phoneFormat);setWorkspaces(info.workspaces);
   const invitation=new URLSearchParams(location.search).get('invite');
   if(invitation){const accepted=await api('team.accept',{token:invitation});history.replaceState(null,'',location.pathname+location.hash);ownerRef.current=accepted.ownerId;setOwnerId(accepted.ownerId);try{sessionStorage.setItem(`oliveira-workspace-${userId}`,accepted.ownerId);}catch{}return;}
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível abrir o workspace.');setLoading(false);}
 },[api,demo,refresh,userId]);
 useEffect(()=>{ownerRef.current=ownerId;void load();return()=>{generation.current++;};},[ownerId,load]);
 const switchWorkspace=(id:string)=>{if(!workspaces.some(w=>w.id===id))return;generation.current++;replace(emptyState());setError(null);ownerRef.current=id;setOwnerId(id);try{sessionStorage.setItem(`oliveira-workspace-${userId}`,id);}catch{}window.dispatchEvent(new Event('oliveira-workspace-changed'));};
 const create=async<K extends EditableTable>(table:K,input:RowInput<K>):Promise<Tables[K]>=>{
  if(demo){const now=new Date().toISOString(),row={...(table==='deals'?{assigned_to:userId||'demo',updated_at:now,stage_changed_at:now,closed_at:null}:{}),...(table==='deal_notes'?{author:'Visitante'}:{}),...input,id:crypto.randomUUID(),created_at:now}as Tables[K];const next={...dataRef.current,[table]:[...dataRef.current[table],row]};if(table==='deals'){const deal=row as Tables['deals'];next.deal_events=[...next.deal_events,{id:crypto.randomUUID(),deal_id:deal.id,kind:'created',detail:{stage:deal.stage,value:deal.value},actor_id:'demo',created_at:now}];}commitDemo(next);return row;}
  const {row}=await api('create',{table,input});replace({...dataRef.current,[table]:[...dataRef.current[table],row]});await refresh().catch(()=>{});return row;
 };
 const update=async<K extends EditableTable>(table:K,id:string,patch:Partial<RowInput<K>>)=>{
  if(demo){const now=new Date().toISOString();let next={...dataRef.current,[table]:dataRef.current[table].map(row=>row.id===id?{...row,...patch}:row)};if(table==='deals')next=demoDealEvents(next,dataRef.current.deals.find(d=>d.id===id),patch as Partial<Tables['deals']>,now);commitDemo(next);return;}
  const {row}=await api('update',{table,id,input:patch});replace({...dataRef.current,[table]:dataRef.current[table].map(current=>current.id===id?row:current)});await refresh().catch(()=>{});
 };
 const remove=async(table:EditableTable,id:string)=>{if(demo){commitDemo(deleteDemoRow(dataRef.current,table,id));return;}await api('delete',{table,id});replace(deleteDemoRow(dataRef.current,table,id));await refresh().catch(()=>{});};
 const askClaude=async(request:ChatRequest):Promise<ChatResult>=>{
  if(demo)throw new Error('A demonstração não chama o Claude. Entre com sua conta para usar a IA real.');
  const session=await supabase!.auth.getSession();if(!session.data.session)throw new Error('Sua sessão expirou. Entre novamente.');
  try{const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.data.session.access_token}`,'X-Workspace-Id':ownerRef.current},body:JSON.stringify(request),signal:AbortSignal.timeout(55000)});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'O Claude não respondeu. Tente novamente.');return result;}finally{await refresh().catch(()=>{});}
 };
 return <Context.Provider value={{data,demo,loading,error,ownerId,userId:userId||'demo',role,workspaceName,logo,phoneFormat,workspaces,refresh,api,switchWorkspace,create,update,remove,askClaude}}>{children}</Context.Provider>;
}

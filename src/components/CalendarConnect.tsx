import {useCallback,useEffect,useState} from 'react';
import {Badge} from './ui';
import {supabase} from '../lib/supabase';
import {useWorkspace} from '../lib/workspace';

type CalendarStatus={configured:boolean;available:boolean;mine:{email:string;connected_at:string}|null;calendars:{member_id:string;email:string}[];scheduling:{aiBooking:boolean;duration:number}};

/** Each SDR connects their own Google Calendar; the AI books meetings on the calendar of the lead's owner. */
export default function CalendarConnect(){
 const {api,demo,ownerId}=useWorkspace(),[status,setStatus]=useState<CalendarStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{try{setStatus(await api<CalendarStatus>('calendar.status'));}catch(e){setError(e instanceof Error?e.message:'Não foi possível consultar a agenda.');}},[api]);
 useEffect(()=>{void load();if(window.location.hash.startsWith('#meetings/calendar-connected')){setNotice('Google Calendar conectado. A IA passa a consultar seus horários livres e criar os eventos na sua agenda.');history.replaceState(null,'','#meetings');}},[load]);
 const connect=async()=>{setBusy(true);setError('');try{const session=await supabase?.auth.getSession();if(!session?.data.session)throw new Error('Entre na sua conta para conectar a agenda.');const response=await fetch('/api/oauth?provider=google_calendar',{method:'POST',headers:{Authorization:`Bearer ${session.data.session.access_token}`,'X-Workspace-Id':ownerId},signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível iniciar a conexão.');location.assign(result.url);}catch(e){setError(e instanceof Error?e.message:'Não foi possível conectar.');setBusy(false);}};
 const disconnect=async()=>{if(!window.confirm('Desconectar seu Google Calendar? A IA deixa de consultar sua agenda e de criar eventos nela.'))return;setBusy(true);setError('');try{await api('calendar.disconnect');setNotice('Agenda desconectada.');await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível desconectar.');}finally{setBusy(false);}};
 const connected=Boolean(status?.mine);
 return <div className="card calendar-connect">
  <div className="calendar-connect-main">
   <span className="channel-mark google" aria-hidden="true">G</span>
   <div>
    <b>Minha agenda Google {status&&<Badge tone={connected?'success':'neutral'}>{connected?'Conectada':'Não conectada'}</Badge>}</b>
    <p>{demo?'Na demonstração a agenda não é conectada. Entre na sua conta para a IA marcar reuniões na agenda do SDR.'
     :connected?`${status!.mine!.email} · A IA oferece seus horários livres e cria o evento${status!.scheduling.aiBooking?'':' (agendamento pela IA desativado em Configurações → Agenda e pipeline)'}.`
     :status&&!status.available?'Aplique a migração 202611010004 no Supabase para conectar agendas.'
     :status&&!status.configured?'Configure o OAuth Google (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e INTEGRATION_ENCRYPTION_KEY) na Vercel para conectar agendas.'
     :'Conecte para a IA consultar seus horários livres e criar as reuniões direto na sua agenda, com link do Meet.'}</p>
   </div>
  </div>
  {!demo&&status&&(connected?<button className="btn" disabled={busy} onClick={()=>void disconnect()}>Desconectar</button>:<button className="btn btn-primary" disabled={busy||!status.configured||!status.available} onClick={()=>void connect()}>{busy?'Abrindo…':'Conectar Google Calendar'}</button>)}
  {(error||notice)&&<p className={error?'crm-error':'crm-success'} role={error?'alert':'status'}>{error||notice}</p>}
 </div>;
}

import {Badge} from '../components/ui';
import {useSettings,Section,Field,Toggle,usePanelData,Empty} from './shared';
import type {Member} from '../lib/settings-types';

const dayLabels=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

export default function SchedulingPanel(){
 const {values,set,api,demo}=useSettings(),s=values.scheduling;
 const {data,error}=usePanelData(async()=>{const [team,calendar]=await Promise.all([api<{members:Member[]}>('team'),api<{configured:boolean;available:boolean;calendars:{member_id:string;email:string}[]}>('calendar.status')]);return {team:team.members,calendar};},[]);
 const connected=new Map((data?.calendar.calendars||[]).map(c=>[c.member_id,c.email]));
 return <>
  <Section title="Pipeline automático" description="Vale para WhatsApp, e-mail, Instagram, widget e conversas do painel.">
   <Toggle label="Criar oportunidade para cada lead" description="Na primeira mensagem, o lead entra em “Novo lead” no Kanban. A IA avança a etapa para Em qualificação, Qualificado e Reunião agendada conforme a triagem. Proposta, Ganho e Perdido continuam com a equipe." checked={s.createDeals} onChange={v=>set('scheduling',{createDeals:v})}/>
  </Section>
  <Section title="Reuniões marcadas pela IA" description="A IA oferece horários livres do SDR responsável pelo lead (ou do dono do workspace) e confirma a reunião quando o cliente escolhe um deles.">
   <Toggle label="IA agenda reuniões" description="Quando o lead confirma um horário oferecido, a reunião é criada no painel e na agenda Google do SDR, se conectada." checked={s.aiBooking} onChange={v=>set('scheduling',{aiBooking:v})}/>
   <Toggle label="Criar link do Google Meet" description="Adiciona videoconferência ao evento e envia o link ao lead na confirmação." checked={s.googleMeet} onChange={v=>set('scheduling',{googleMeet:v})}/>
   <div className="settings-form-grid">
    <Field label="Duração da reunião"><select value={s.duration} onChange={e=>set('scheduling',{duration:Number(e.target.value)})}>{[15,30,45,60,90].map(n=><option key={n} value={n}>{n} minutos</option>)}</select></Field>
    <Field label="Antecedência mínima" help="Horas entre a conversa e o primeiro horário oferecido."><input type="number" min={0} max={72} value={s.minNoticeHours} onChange={e=>set('scheduling',{minNoticeHours:Math.round(Number(e.target.value))})}/></Field>
    <Field label="Oferecer horários nos próximos" help="Dias corridos."><input type="number" min={1} max={30} value={s.horizonDays} onChange={e=>set('scheduling',{horizonDays:Math.round(Number(e.target.value))})}/></Field>
   </div>
   <div className="schedule-editor">
    <b>Horário disponível para reuniões</b>
    <div className="schedule-days">{dayLabels.map((label,d)=><button type="button" key={d} aria-label={label} aria-pressed={s.schedule.days.includes(d)} className={s.schedule.days.includes(d)?'selected':''} onClick={()=>set('scheduling',{schedule:{...s.schedule,days:s.schedule.days.includes(d)?s.schedule.days.filter(v=>v!==d):[...s.schedule.days,d].sort()}})}>{label}</button>)}</div>
    <div className="settings-inline"><input aria-label="Início das reuniões" type="time" value={s.schedule.start} onChange={e=>set('scheduling',{schedule:{...s.schedule,start:e.target.value}})}/><span>às</span><input aria-label="Fim das reuniões" type="time" value={s.schedule.end} onChange={e=>set('scheduling',{schedule:{...s.schedule,end:e.target.value}})}/></div>
   </div>
  </Section>
  <Section title="Agendas da equipe" description="Cada SDR conecta a própria agenda em Reuniões → “Conectar Google Calendar”. Os horários ocupados nessa agenda não são oferecidos aos leads.">
   {demo?<Empty>Na demonstração as agendas não são conectadas.</Empty>
    :error?<div className="crm-error" role="alert">{error}</div>
    :!data?<Empty>Carregando agendas…</Empty>
    :<>{!data.calendar.configured&&<div className="crm-info">Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e INTEGRATION_ENCRYPTION_KEY na Vercel e cadastre o endereço de retorno <code>/api/oauth?provider=google_calendar</code> no Google Cloud. Sem agenda conectada, a IA usa apenas o horário acima e as reuniões já cadastradas no painel.</div>}
     {!data.calendar.available&&<div className="crm-info">Aplique a migração 202611010004 no Supabase para conectar agendas.</div>}
     <div className="calendar-team">{data.team.filter(m=>m.status==='active'&&m.user_id).map(m=><div className="settings-row" key={m.id}><div><b>{m.name||m.email}</b><p>{connected.get(m.user_id!)||'Agenda não conectada'}</p></div><Badge tone={connected.has(m.user_id!)?'success':'neutral'}>{connected.has(m.user_id!)?'Google conectado':'Sem agenda'}</Badge></div>)}</div></>}
  </Section>
 </>;
}

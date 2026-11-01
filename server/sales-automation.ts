// Automatic sales actions taken after the AI answers a lead: keep one open
// opportunity per contact in the pipeline, offer the SDR's free calendar slots
// and book the meeting the customer confirmed (internal agenda + Google Calendar).
// Every step is best effort for the caller: a failure here must never block the reply.
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Contact, DealStage, Triage} from '../src/lib/types.js';
import type {SchedulingSettings} from '../src/lib/settings-types.js';
import {unseal} from './access.js';
import {localClock} from './schedules.js';

const stageOrder: DealStage[] = ['new', 'qualifying', 'qualified', 'meeting', 'proposal', 'won', 'lost'];
type Interval = {start: number; end: number};
export type Slot = {id: string; label: string};
export type SchedulingContext = {owner: string; sdr: string; settings: SchedulingSettings; timeZone: string; slots: Slot[]; calendar: CalendarAccount | null; prompt: string};
type CalendarAccount = {email: string; secret: string};
export type AutomationOutcome = {reply: string; booked: boolean; meetingId?: string};

export function dealTitle(contact: Pick<Contact, 'name' | 'company'>) {
  const name = contact.name.trim() || 'Lead';
  return (contact.company?.trim() ? `${name} · ${contact.company.trim()}` : name).slice(0, 200);
}

/** Stage the pipeline should reach for the current triage; never moves a deal backwards or out of proposal/won/lost. */
export function nextStage(current: DealStage | null, status: Triage['status'] | null, booked: boolean): DealStage | null {
  const target: DealStage = booked ? 'meeting' : status === 'qualified' ? 'qualified' : status === 'qualifying' ? 'qualifying' : 'new';
  if (current === null) return target;
  if (['proposal', 'won', 'lost'].includes(current)) return null;
  return stageOrder.indexOf(target) > stageOrder.indexOf(current) ? target : null;
}

/** Creates the opportunity on the lead's first message and advances it with the triage. */
export async function syncDeal(db: SupabaseClient, owner: string, contact: Pick<Contact, 'id' | 'name' | 'company'>, status: Triage['status'] | null = null, booked = false) {
  const existing = await db.from('deals').select('id,stage').eq('user_id', owner).eq('contact_id', contact.id).order('created_at', {ascending: false}).limit(20);
  if (existing.error) throw new Error('deals_unavailable');
  const open = existing.data.find(d => d.stage !== 'won' && d.stage !== 'lost');
  // A closed opportunity is the team's decision; a returning lead does not reopen it automatically.
  if (!open && existing.data.length) return null;
  const stage = nextStage(open ? open.stage as DealStage : null, status, booked);
  if (!stage) return open?.id ?? null;
  if (!open) {
    const created = await db.from('deals').insert({user_id: owner, contact_id: contact.id, title: dealTitle(contact), value: 0, stage}).select('id').single();
    if (created.error) throw new Error('deal_create_failed');
    return created.data.id as string;
  }
  const updated = await db.from('deals').update({stage}).eq('user_id', owner).eq('id', open.id);
  if (updated.error) throw new Error('deal_update_failed');
  return open.id as string;
}

/** Creates the opportunity for a conversation started by a channel (first WhatsApp message, even when a person answers). */
export async function ensureDealForConversation(db: SupabaseClient, conversationId: string) {
  const conversation = await db.from('conversations').select('user_id,contact_id').eq('id', conversationId).maybeSingle();
  if (conversation.error || !conversation.data?.contact_id) return null;
  const contact = await db.from('contacts').select('id,name,company').eq('user_id', conversation.data.user_id).eq('id', conversation.data.contact_id).maybeSingle();
  if (contact.error || !contact.data) return null;
  const settings = await db.from('workspace_settings').select('config').eq('user_id', conversation.data.user_id).maybeSingle();
  if (settings.data?.config?.scheduling?.createDeals === false) return null;
  return syncDeal(db, conversation.data.user_id, contact.data);
}

const slotLabel = (date: Date, timeZone: string) => new Intl.DateTimeFormat('pt-BR', {timeZone, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}).format(date);
const insideHours = (settings: SchedulingSettings, timeZone: string, start: Date, end: Date) => {
  const a = localClock(start, timeZone), b = localClock(new Date(end.getTime() - 60000), timeZone);
  return a.date === b.date && settings.schedule.days.includes(a.day) && a.time >= settings.schedule.start && b.time < settings.schedule.end;
};

/** Free slots on a 30 minute grid, inside working hours, at most three per day. */
export function freeSlots(settings: SchedulingSettings, timeZone: string, busy: Interval[], now = new Date(), limit = 9): Date[] {
  const step = 30 * 60000, duration = settings.duration * 60000;
  let cursor = Math.ceil((now.getTime() + settings.minNoticeHours * 3600000) / step) * step;
  const until = now.getTime() + settings.horizonDays * 86400000, perDay = new Map<string, number>(), slots: Date[] = [];
  for (; cursor <= until && slots.length < limit; cursor += step) {
    const start = new Date(cursor), end = new Date(cursor + duration);
    if (!insideHours(settings, timeZone, start, end)) continue;
    if (busy.some(b => b.start < end.getTime() && b.end > start.getTime())) continue;
    const day = localClock(start, timeZone).date, used = perDay.get(day) ?? 0;
    if (used >= 3) continue;
    perDay.set(day, used + 1);
    slots.push(start);
    cursor += step; // leave a gap so options are spread across the day
  }
  return slots;
}

async function googleAccessToken(account: CalendarAccount) {
  const saved = unseal<{refresh_token: string}>(account.secret);
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new Error('google_not_configured');
  const r = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: saved.refresh_token, grant_type: 'refresh_token'})});
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.access_token) throw new Error('google_token_failed');
  return d.access_token as string;
}

async function googleRequest(token: string, path: string, body: unknown) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw new Error('google_calendar_failed');
  return d;
}

export async function calendarAccount(db: SupabaseClient, owner: string, member: string): Promise<CalendarAccount | null> {
  const r = await db.from('calendar_accounts').select('email,secret').eq('owner_id', owner).eq('member_id', member).maybeSingle();
  return r.error || !r.data ? null : r.data;
}

/** Busy intervals of the SDR: scheduled meetings of leads assigned to them plus their Google Calendar. */
async function busyIntervals(db: SupabaseClient, owner: string, sdr: string, calendar: CalendarAccount | null, from: Date, to: Date): Promise<Interval[]> {
  const meetings = await db.from('meetings').select('starts_at,duration,contact_id').eq('user_id', owner).eq('status', 'scheduled').gte('starts_at', new Date(from.getTime() - 8 * 3600000).toISOString()).lte('starts_at', to.toISOString()).limit(500);
  if (meetings.error) throw new Error('meetings_unavailable');
  const ids = [...new Set(meetings.data.map(m => m.contact_id).filter(Boolean))];
  const owners = new Map<string, string>();
  if (ids.length) {
    const contacts = await db.from('contacts').select('id,assigned_to').eq('user_id', owner).in('id', ids);
    if (contacts.error) throw new Error('contacts_unavailable');
    for (const c of contacts.data) owners.set(c.id, c.assigned_to || owner);
  }
  const busy = meetings.data.filter(m => (m.contact_id ? owners.get(m.contact_id) ?? owner : owner) === sdr).map(m => ({start: Date.parse(m.starts_at), end: Date.parse(m.starts_at) + m.duration * 60000}));
  if (calendar) {
    const token = await googleAccessToken(calendar);
    const result = await googleRequest(token, 'freeBusy', {timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{id: 'primary'}]});
    for (const b of result.calendars?.primary?.busy ?? []) busy.push({start: Date.parse(b.start), end: Date.parse(b.end)});
  }
  return busy;
}

/** Builds the slot list and prompt section; null when the workspace disabled AI booking. */
export async function schedulingContext(db: SupabaseClient, owner: string, contact: Pick<Contact, 'assigned_to'>, settings: SchedulingSettings, timeZone: string, now = new Date()): Promise<SchedulingContext | null> {
  if (!settings.aiBooking) return null;
  const sdr = contact.assigned_to || owner;
  const calendar = await calendarAccount(db, owner, sdr);
  let busy: Interval[];
  try { busy = await busyIntervals(db, owner, sdr, calendar, now, new Date(now.getTime() + (settings.horizonDays + 1) * 86400000)); }
  catch { busy = await busyIntervals(db, owner, sdr, null, now, new Date(now.getTime() + (settings.horizonDays + 1) * 86400000)); }
  const slots = freeSlots(settings, timeZone, busy, now).map(d => ({id: d.toISOString(), label: slotLabel(d, timeZone)}));
  const prompt = slots.length
    ? `Agendamento de reuniões (instrução do sistema): você pode marcar uma reunião de ${settings.duration} minutos com o responsável comercial. Horários livres (fuso ${timeZone}): ${JSON.stringify(slots)}.
Quando o cliente demonstrar interesse em avançar (por exemplo, após entender a necessidade ou pedir uma conversa), ofereça 2 ou 3 opções desta lista usando o "label". Só preencha "meeting" com o "id" exato do horário quando o cliente confirmar explicitamente um horário da lista; caso contrário, "meeting" deve ser null. Nunca ofereça ou confirme horários fora da lista. Não diga que a reunião está confirmada sem preencher "meeting": o sistema confirma o agendamento e envia os detalhes.`
    : 'Agendamento de reuniões (instrução do sistema): não há horários livres na agenda do responsável nos próximos dias. Se o cliente pedir reunião, diga que a equipe entrará em contato para combinar e mantenha "meeting" null.';
  return {owner, sdr, settings, timeZone, slots, calendar, prompt};
}

/** Books the confirmed slot; on conflict the reply offers the remaining options instead of a false confirmation. */
export async function bookMeeting(db: SupabaseClient, ctx: SchedulingContext, contact: Pick<Contact, 'id' | 'name' | 'email' | 'company'>, slotId: string, reply: string): Promise<AutomationOutcome> {
  const offered = ctx.slots.find(s => s.id === slotId);
  const alternatives = () => {
    const rest = ctx.slots.filter(s => s.id !== slotId).slice(0, 3).map(s => `• ${s.label}`).join('\n');
    return rest ? `Esse horário não está mais disponível. Posso te oferecer:\n${rest}\nQual fica melhor para você?` : 'Esse horário não está mais disponível. Nossa equipe vai entrar em contato para combinar um novo horário.';
  };
  if (!offered) return {reply: alternatives(), booked: false};
  const start = new Date(slotId), end = new Date(start.getTime() + ctx.settings.duration * 60000);
  const already = await db.from('meetings').select('id,location').eq('user_id', ctx.owner).eq('contact_id', contact.id).eq('status', 'scheduled').eq('starts_at', start.toISOString()).maybeSingle();
  if (already.data) return {reply, booked: true, meetingId: already.data.id};
  const busy = await busyIntervals(db, ctx.owner, ctx.sdr, ctx.calendar, start, end).catch(() => busyIntervals(db, ctx.owner, ctx.sdr, null, start, end));
  if (busy.some(b => b.start < end.getTime() && b.end > start.getTime())) return {reply: alternatives(), booked: false};
  const title = `Reunião comercial · ${dealTitle(contact)}`.slice(0, 200);
  const created = await db.from('meetings').insert({user_id: ctx.owner, contact_id: contact.id, title, starts_at: start.toISOString(), duration: ctx.settings.duration, location: '', status: 'scheduled'}).select('id').single();
  if (created.error) throw new Error('meeting_create_failed');
  // Columns from the 202611010004 migration; ignored if it has not been applied yet.
  await db.from('meetings').update({source: 'ai', assigned_to: ctx.sdr}).eq('user_id', ctx.owner).eq('id', created.data.id);
  let link = '';
  if (ctx.calendar) {
    try {
      const token = await googleAccessToken(ctx.calendar);
      const event = await googleRequest(token, `calendars/primary/events?conferenceDataVersion=${ctx.settings.googleMeet ? 1 : 0}&sendUpdates=all`, {
        summary: title,
        description: `Agendada pela IA SDR no WhatsApp/painel.\nLead: ${contact.name}${contact.company ? ` (${contact.company})` : ''}`,
        start: {dateTime: start.toISOString(), timeZone: ctx.timeZone}, end: {dateTime: end.toISOString(), timeZone: ctx.timeZone},
        ...(contact.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) ? {attendees: [{email: contact.email}]} : {}),
        ...(ctx.settings.googleMeet ? {conferenceData: {createRequest: {requestId: created.data.id, conferenceSolutionKey: {type: 'hangoutsMeet'}}}} : {}),
      });
      link = event.hangoutLink || '';
      await db.from('meetings').update({location: (link || event.htmlLink || '').slice(0, 2000)}).eq('user_id', ctx.owner).eq('id', created.data.id);
      await db.from('meetings').update({calendar_event_id: String(event.id || '').slice(0, 300)}).eq('user_id', ctx.owner).eq('id', created.data.id);
    } catch { /* The internal meeting stays booked; the SDR still sees it in the panel. */ }
  }
  const confirmation = `Reunião confirmada: ${offered.label} (${ctx.settings.duration} min).${link ? `\nLink: ${link}` : ''}`;
  return {reply: `${reply}\n\n${confirmation}`, booked: true, meetingId: created.data.id};
}

/** Runs booking and pipeline sync for one AI turn and returns the reply to deliver. */
export async function applySalesAutomation(db: SupabaseClient, input: {owner: string; contact: Contact; triage: Triage; meeting: string | null; reply: string; scheduling: SchedulingContext | null; settings: SchedulingSettings}) {
  let outcome: AutomationOutcome = {reply: input.reply, booked: false};
  if (input.meeting && input.scheduling) {
    try { outcome = await bookMeeting(db, input.scheduling, input.contact, input.meeting, input.reply); }
    catch { outcome = {reply: `${input.reply}\n\nVou confirmar esse horário com a equipe e retorno em seguida.`, booked: false}; }
  }
  return outcome;
}

export async function syncDealAfterTurn(db: SupabaseClient, owner: string, contact: Contact, triage: Triage, booked: boolean, settings: SchedulingSettings) {
  if (!settings.createDeals) return;
  try { await syncDeal(db, owner, contact, triage.status, booked); } catch { /* pipeline sync must not affect the conversation */ }
}

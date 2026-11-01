import { useEffect, useMemo, type CSSProperties } from 'react';
import { stageProbability, stages, type DealStage } from '../lib/types';
import { Avatar } from '../components/ui';
import { brl, Count, DIcon, Hot, meetingDay, monthShort, weekdayShort, Words } from './ui';
import type { SceneProps } from './scenes-inbox';

const s = (i: number): CSSProperties => ({ '--i': i } as CSSProperties);

/* ============ Ficha do cliente ============ */
export function ProfileScene({ step, company }: SceneProps) {
  const day = useMemo(meetingDay, []);
  const summary = `Beatriz quer fazer uma avaliação de harmonização facial antes do casamento da irmã, em dezembro. Tem até R$ 4 mil de orçamento e decide sozinha. Chegou pelo Instagram Ads às 02:14, foi atendida pela Felipa em 8 segundos e aceitou a avaliação com a Dra. Helena ${weekdayShort(day)} às 14:30.`;
  const evidence = [
    ['Orçamento', 70, '“Até uns R$ 4 mil.”', '02:16'], ['Necessidade', 90, '“Vocês fazem avaliação de harmonização facial?”', '02:14'],
    ['Autoridade', 95, '“Decido sozinha, não preciso consultar ninguém.”', '02:16'], ['Prazo', 80, '“É para o casamento da minha irmã em dezembro.”', '02:15'],
  ] as const;
  const timeline = [
    ['bolt', 'Lead chegou pelo Instagram Ads', '02:14'], ['spark', 'Felipa respondeu em 8 segundos', '02:14'], ['target', 'Qualificação concluída · score 92', '02:16'],
    ['pipeline', 'Oportunidade criada · R$ 4.000', '02:16'], ['calendar', `Reunião agendada · ${weekdayShort(day)} 14:30 com a Dra. Helena`, '02:17'], ['check', 'Tarefa criada: preparar plano personalizado', '02:18'],
  ] as const;
  useEffect(() => {
    const timer = window.setTimeout(() => window.scrollTo({ top: step >= 2 ? document.documentElement.scrollHeight : 0, behavior: 'smooth' }), step >= 2 ? 1000 : 60);
    return () => window.clearTimeout(timer);
  }, [step]);
  return <div className="dm-page dm-profile" data-step={step}>
    <div className="page-header"><div><div className="dm-crumb"><DIcon name="chevronLeft" size={14} /> Contatos</div>
      <h1 className="page-title dm-title-row"><Avatar name="Beatriz Nogueira" tone="tone-0" /> Beatriz Nogueira <span className="badge badge-success">Qualificado</span><span className="badge badge-danger">🔥 Score 92</span></h1>
      <p className="page-description">{company} · Instagram Ads · criada automaticamente às 02:14</p></div>
      <div className="page-actions"><button className="btn" tabIndex={-1}><DIcon name="whatsapp" size={15} /> WhatsApp</button><button className="btn btn-primary" tabIndex={-1}><DIcon name="calendar" size={15} /> Ver reunião</button></div></div>
    <div className="dm-profile-grid">
      <div className="dm-col">
        <div className="card dm-summary dm-rise-in"><div className="dm-card-head"><span className="dm-ic red"><DIcon name="spark" size={16} /></span><b>Resumo da Felipa</b><span className="badge badge-brand">Factual · só o que o cliente disse</span></div>
          <p key="sum"><Words text={summary} step={22} /></p>
          <div className="dm-nextact"><DIcon name="bolt" size={15} /><span><b>Próxima ação</b> Confirmar presença na véspera (automático) e levar o plano personalizado para a reunião.</span></div></div>
        {step >= 1 && <div className="card dm-evidence dm-rise-in" key="ev"><div className="dm-card-head"><span className="dm-ic ink"><DIcon name="target" size={16} /></span><b>Critérios de qualificação</b><span className="badge badge-neutral">Cada nota com evidência</span></div>
          <div className="dm-evidence-grid">{evidence.map(([label, value, quote, time], index) => <div className="dm-ev" key={label} style={s(index)}>
            <div className="dm-ev-top"><span>{label}</span><b>{value}%</b></div><div className="score-track"><i style={{ width: `${value}%`, animationDelay: `${index * 140 + 200}ms` }} /></div>
            <blockquote><DIcon name="message" size={12} /> {quote}<small>Mensagem das {time}</small></blockquote></div>)}</div></div>}
        {step >= 2 && <div className="card dm-tasks dm-rise-in" key="tk"><div className="dm-card-head"><span className="dm-ic green"><DIcon name="check" size={16} /></span><b>Tarefas</b><span className="badge badge-neutral">2 abertas</span></div>
          {[['Preparar plano personalizado para a avaliação', 'Dra. Helena', `${weekdayShort(day)}, antes das 14:30`], ['Confirmar presença com a Beatriz', 'Automático · Felipa', 'Véspera, 18:00']].map(([title, who, due], index) => <div className="dm-task" key={title} style={s(index)}><span className="dm-box" /><div><b>{title}</b><small>{who} · {due}</small></div></div>)}</div>}
      </div>
      <aside className="dm-col">
        <div className="card dm-details"><div className="dm-card-head"><b>Detalhes</b></div>
          <dl>{[['Telefone', '+55 11 9•••• 4821'], ['E-mail', 'bea•••@email.com'], ['Origem', 'Instagram Ads'], ['Interesse', 'Harmonização facial'], ['Responsável', 'Dra. Helena (consultora)'], ['Etiquetas', 'Quente · Casamento']].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>
        <div className="card dm-timeline"><div className="dm-card-head"><b>Linha do tempo</b><span className="badge badge-brand">Automática</span></div>
          <ol>{timeline.map(([icon, text, time], index) => <li key={text} style={{ ...s(index), animationDelay: `${(step === 2 ? 150 : 0) + index * 120}ms` } as CSSProperties} className={step >= 2 || index < 2 ? 'dm-tl-in' : 'dm-tl-off'}>
            <span className="dm-ic ink"><DIcon name={icon} size={14} /></span><div><b>{text}</b><small>{time}</small></div></li>)}</ol></div>
      </aside>
    </div>
  </div>;
}

/* ============ Reuniões ============ */
export function MeetingsScene({ step, go }: SceneProps) {
  const day = useMemo(meetingDay, []);
  const dayOffset = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d; };
  const block = (d: Date) => ({ month: monthShort(d), day: d.getDate() });
  const mine = block(day);
  const list = [
    { title: 'Diagnóstico · Rafael Menezes', d: dayOffset(1), time: '10:00', who: 'Rafael Menezes', ai: true, state: 'scheduled' },
    { title: 'Retorno · Patrícia Lima', d: dayOffset(2), time: '16:00', who: 'Patrícia Lima', ai: false, state: 'scheduled' },
    { title: 'Avaliação · Carla Souza', d: dayOffset(-3), time: '11:00', who: 'Carla Souza', ai: true, state: 'completed' },
  ] as const;
  const first = new Date(day.getFullYear(), day.getMonth(), 1), daysIn = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const marked = new Set([day.getDate(), dayOffset(1).getDate(), dayOffset(2).getDate()]);
  const today = new Date().getDate();
  const month = day.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const slots = ['09:00', '10:30', '14:30', '16:00', '17:30'];
  return <div className="dm-page v2-page" data-step={step}>
    <div className="page-header"><div><h1 className="page-title">Reuniões</h1><p className="page-description">Organize conversas comerciais e registre os resultados.</p></div>
      <div className="page-actions"><button className="v2-primary" tabIndex={-1}><DIcon name="plus" size={16} /> Agendar reunião</button></div></div>
    <div className="v2-stats"><div><span>Próximas reuniões</span><b className="accent"><Count to={4} ms={700} /></b><small>Agendadas para o futuro</small></div><div><span>Realizadas</span><b>12</b><small>Resultados registrados</small></div><div><span>Agendadas pela IA</span><b>9</b><small>Sem ninguém digitar</small></div><div><span>Total de reuniões</span><b>17</b><small>Todo o histórico</small></div></div>
    <div className="v2-body">
      <div className="v2-card v2-list">
        <div className="v2-tabs"><button className="v2-tab active" tabIndex={-1}>Todas<span className="v2-count">17</span></button><button className="v2-tab" tabIndex={-1}>Próximas<span className="v2-count">4</span></button><button className="v2-tab" tabIndex={-1}>Realizadas<span className="v2-count">12</span></button></div>
        <Hot on={step === 0} go={go} hint="Abrir a reunião" className="dm-meeting-wrap" radius="16px">
          <article className="v2-meeting dm-new-meeting">
            <div className="v2-date" aria-hidden="true"><span>{mine.month}</span><b>{mine.day}</b></div>
            <div className="v2-meeting-info"><div className="v2-title-row"><h2>Avaliação · Beatriz Nogueira</h2><span className="v2-pill"><i />Agendada</span><span className="v2-pill ai"><DIcon name="spark" size={11} /> Agendada pela IA</span></div>
              <div className="v2-meta"><span><DIcon name="clock" size={15} />14:30 · 30 min</span><span><DIcon name="globe" size={15} />Brasília (GMT-3)</span><span><DIcon name="user" size={15} />Beatriz Nogueira</span><span className="v2-location"><DIcon name="link" size={15} />meet.google.com/abc-defg-hij</span></div></div>
            <div className="v2-row-actions"><span className="v2-btn" aria-hidden="true"><DIcon name="download" size={16} />Baixar .ics</span></div>
          </article>
        </Hot>
        {step >= 1 && <div className="dm-detail" key="detail">
          {[['video', 'Link do Google Meet gerado', 'meet.google.com/abc-defg-hij'], ['mail', 'Convite enviado por e-mail', 'Beatriz recebeu o convite com os dados da avaliação'], ['whatsapp', 'Lembrete automático no WhatsApp', 'Véspera às 18:00 e 2 horas antes'], ['calendar', 'Google Agenda da Dra. Helena atualizado', 'Horário bloqueado, sem risco de conflito']].map(([icon, title, text], index) =>
            <div className="dm-detail-row" key={title} style={s(index)}><span className="dm-ic green"><DIcon name={icon as 'video'} size={16} /></span><div><b>{title}</b><small>{text}</small></div><span className="dm-done"><DIcon name="check" size={14} /></span></div>)}
        </div>}
        {list.map((m) => { const b = block(m.d); return <article className="v2-meeting" key={m.title}>
          <div className={`v2-date ${m.state}`} aria-hidden="true"><span>{b.month}</span><b>{b.day}</b></div>
          <div className="v2-meeting-info"><div className="v2-title-row"><h2>{m.title}</h2><span className={`v2-pill ${m.state}`}><i />{m.state === 'completed' ? 'Realizada' : 'Agendada'}</span>{m.ai && <span className="v2-pill ai">Agendada pela IA</span>}</div>
            <div className="v2-meta"><span><DIcon name="clock" size={15} />{m.time} · 30 min</span><span><DIcon name="user" size={15} />{m.who}</span></div></div></article>; })}
        <div className="v2-hint"><DIcon name="spark" size={18} /><span>Reuniões marcadas pela IA aparecem aqui automaticamente, com link do Meet e convite enviado ao lead.</span></div>
      </div>
      <aside className="v2-side">
        <div className="card calendar-connect"><div className="calendar-connect-main"><span className="channel-mark">G</span><div><b>Google Agenda <span className="badge badge-success">Conectado</span></b><p>Dra. Helena · a IA só oferece horários livres.</p></div></div></div>
        <div className="v2-card v2-cal"><div className="v2-cal-head"><b>{month.charAt(0).toUpperCase() + month.slice(1)}</b></div>
          <div className="v2-cal-grid v2-cal-week" aria-hidden="true">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="v2-cal-grid">{cells.map((n, i) => n ? <span key={i} className={`v2-day ${n === today ? 'today' : ''} ${marked.has(n) ? 'has' : ''} ${n === day.getDate() ? 'dm-mine' : ''}`}>{n}</span> : <span key={i} />)}</div></div>
        {step >= 1 && <div className="card dm-free" key="free"><div className="dm-card-head"><b>Horários livres · {weekdayShort(day)}</b><span className="badge badge-neutral">Dra. Helena</span></div>
          <div className="dm-slot-grid">{slots.map((t) => <span key={t} className={t === '14:30' ? 'taken' : ''}>{t}{t === '14:30' && <small>Beatriz</small>}</span>)}</div></div>}
      </aside>
    </div>
  </div>;
}

/* ============ Funil ============ */
type Deal = { id: string; title: string; sub: string; value: number; stage: DealStage; due: string; days: number; owner: string; tasks?: number };
const baseDeals = (): Deal[] => {
  const date = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''); };
  return [
    { id: 'a', title: 'Harmonização · Lucas Andrade', sub: 'Lucas Andrade', value: 2800, stage: 'new', due: date(12), days: 0, owner: 'FE' },
    { id: 'b', title: 'Lentes · Marcos Vieira', sub: 'Marcos Vieira', value: 9500, stage: 'new', due: date(20), days: 1, owner: 'FE' },
    { id: 'c', title: 'Pacote facial · Juliana Prado', sub: 'Juliana Prado', value: 3900, stage: 'qualifying', due: date(9), days: 1, owner: 'FE', tasks: 1 },
    { id: 'd', title: 'Preenchimento · Rafael Menezes', sub: 'Rafael Menezes', value: 5200, stage: 'qualifying', due: date(7), days: 2, owner: 'FE' },
    { id: 'e', title: 'Bioestimulador · Patrícia Lima', sub: 'Patrícia Lima', value: 6800, stage: 'qualified', due: date(6), days: 2, owner: 'HE', tasks: 2 },
    { id: 'f', title: 'Harmonização · Carla Souza', sub: 'Carla Souza', value: 7400, stage: 'meeting', due: date(5), days: 3, owner: 'HE' },
    { id: 'g', title: 'Implante · Eduardo Reis', sub: 'Eduardo Reis', value: 18000, stage: 'meeting', due: date(10), days: 4, owner: 'HE', tasks: 1 },
    { id: 'h', title: 'Full face · Fernanda Alves', sub: 'Fernanda Alves', value: 12600, stage: 'proposal', due: date(4), days: 5, owner: 'HE', tasks: 2 },
    { id: 'i', title: 'Lentes · Gustavo Pires', sub: 'Gustavo Pires', value: 21000, stage: 'proposal', due: date(8), days: 6, owner: 'HE' },
  ];
};
const open: DealStage[] = ['new', 'qualifying', 'qualified', 'meeting', 'proposal'];
const tone: Record<string, string> = { new: 'gray', qualifying: 'blue', qualified: 'violet', meeting: 'amber', proposal: 'teal' };
const bea: (DealStage | null)[] = [null, 'new', 'qualified', 'meeting'];
const hop = [0, 0, 2, 1];

export function PipelineScene({ step, go }: SceneProps) {
  const deals = useMemo(() => {
    const list = baseDeals();
    const stage = bea[step];
    if (stage) list.push({ id: 'bea', title: 'Harmonização · Beatriz Nogueira', sub: 'Beatriz Nogueira', value: 4000, stage, due: meetingDay().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''), days: 0, owner: 'FE', tasks: stage === 'meeting' ? 2 : undefined });
    return list;
  }, [step]);
  const total = deals.reduce((sum, d) => sum + d.value, 0);
  const weighted = deals.reduce((sum, d) => sum + d.value * stageProbability[d.stage] / 100, 0);
  const card = (d: Deal) => {
    const mine = d.id === 'bea';
    const body = <article key={mine ? `bea${step}` : d.id} className={`opp-card ${mine ? 'dm-bea' : ''} ${mine ? (hop[step] ? 'dm-land' : 'dm-pop') : ''}`} style={mine ? ({ '--hop': hop[step] } as CSSProperties) : undefined}>
      {mine && <span className="dm-ia-tag"><DIcon name="spark" size={11} /> Criada pela IA</span>}
      <div className="opp-card-title">{d.title}</div><div className="opp-card-sub">{d.sub}</div>
      <div className="opp-card-value">{brl(d.value)}<small>{stageProbability[d.stage]}%</small></div>
      <div className="opp-card-foot"><span className="opp-meta"><DIcon name="calendar" size={13} />{d.due}</span>{d.tasks ? <span className="opp-meta"><DIcon name="check" size={13} />{d.tasks}</span> : null}<span className="opp-meta"><DIcon name="clock" size={13} />{d.days}d</span><span className="opp-card-owner"><span className="opp-avatar sm">{d.owner}</span></span></div>
    </article>;
    return mine ? <Hot key="bea" on={step === 1} go={go} hint="Avançar a etapa" className="dm-card-wrap" radius="12px">{body}</Hot> : body;
  };
  return <div className="dm-page opp-page" data-step={step}>
    <div className="page-header"><div><h1 className="page-title">Oportunidades</h1><p className="page-description">Acompanhe cada negociação do primeiro contato ao fechamento.</p></div>
      <div className="page-actions"><button className="btn" tabIndex={-1}><DIcon name="download" size={16} />Exportar CSV</button><button className="btn btn-primary" tabIndex={-1}><DIcon name="plus" size={16} />Nova oportunidade</button></div></div>
    <div className="opp-kpis">
      <div className="card"><span>Pipeline aberto</span><b>{brl(Math.round(total))}</b><small>{deals.length} oportunidades em andamento</small></div>
      <div className="card"><span>Previsão ponderada</span><b className={step === 3 ? 'dm-up' : ''} key={`w${step}`}>{brl(Math.round(weighted))}</b><small>Valor × probabilidade de cada etapa</small></div>
      <div className="card"><span>Ganho no mês</span><b>{brl(31800)}</b><small>2 negócios fechados</small></div>
      <div className="card"><span>Taxa de ganho</span><b>34%</b><small>11 ganhas · 21 perdidas</small></div>
    </div>
    <div className="opp-board dm-board" aria-label="Kanban de oportunidades">
      {open.map((stage) => { const list = deals.filter((d) => d.stage === stage); return <section key={stage} className={`opp-column ${list.some((d) => d.id === 'bea') ? 'dm-target' : ''}`} aria-label={stages[stage]}>
        <header className="opp-column-head"><span className={`opp-dot tone-${tone[stage]}`} /><b>{stages[stage]}</b><span className="opp-count">{list.length}</span><span className="opp-sum">{brl(list.reduce((s0, d) => s0 + d.value, 0))}</span></header>
        <div className="opp-column-body">{list.map(card)}</div></section>; })}
    </div>
  </div>;
}

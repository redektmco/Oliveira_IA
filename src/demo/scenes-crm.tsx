import { useEffect, useMemo, type CSSProperties } from 'react';
import { stageProbability, stages, type DealStage } from '../lib/types';
import { brl, Count, DIcon, Hot, meetingDay, monthShort, weekdayShort, Words } from './ui';
import type { SceneProps } from './scenes-inbox';

const s = (i: number): CSSProperties => ({ '--i': i } as CSSProperties);

/* ============ Ficha do cliente (mesma estrutura de src/pages/ContactProfile.tsx) ============ */
const stageList: DealStage[] = ['new', 'qualifying', 'qualified', 'meeting', 'proposal', 'won'];
export function ProfileScene({ step, company }: SceneProps) {
  const day = useMemo(meetingDay, []);
  const summary = `Beatriz quer fazer uma avaliação de harmonização facial antes do casamento da irmã, em dezembro. Tem até R$ 4 mil de orçamento e decide sozinha. Chegou pelo Instagram Ads às 02:14, foi atendida pela Felipa e aceitou a avaliação com a Dra. Helena ${weekdayShort(day)} às 14:30.`;
  const criteria = [
    ['Orçamento', 70, 'Disse “até uns R$ 4 mil”.'], ['Necessidade', 90, 'Pediu avaliação de harmonização facial.'],
    ['Autoridade', 95, 'Disse “decido sozinha, não preciso consultar ninguém”.'], ['Prazo', 80, 'Precisa para o casamento da irmã, em dezembro.'],
  ] as const;
  const stamp = (t: string) => `${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${t}`;
  useEffect(() => {
    const timer = window.setTimeout(() => window.scrollTo({ top: step >= 2 ? document.documentElement.scrollHeight : 0, behavior: 'smooth' }), step >= 2 ? 900 : 60);
    return () => window.clearTimeout(timer);
  }, [step]);
  return <div className="content client-profile dm-profile" data-step={step}>
    <a className="profile-back" href="#contacts" tabIndex={-1}>← Voltar para contatos</a>
    <header className="profile-header">
      <div className="profile-identity"><div className="profile-avatar">BN</div><div>
        <div className="profile-title"><h1>Beatriz Nogueira</h1><span className="badge badge-brand">Qualificado</span><span className="badge badge-success"><DIcon name="spark" size={13} />SDR IA ativa</span></div>
        <div className="profile-meta"><span><DIcon name="building" size={14} />{company}</span><span>+55 11 9 •••• 4821</span><span>Lead desde {new Date().toLocaleDateString('pt-BR')}</span></div></div></div>
      <div className="profile-actions"><button className="btn" tabIndex={-1}>Pausar IA</button><button className="btn" tabIndex={-1}><DIcon name="calendar" size={15} />Agendar reunião</button><button className="btn btn-primary" tabIndex={-1}><DIcon name="message" size={15} />Assumir conversa</button></div>
    </header>
    <ol className="profile-pipeline" aria-label="Etapa comercial">
      {stageList.map((stage, index) => <li key={stage} className={stage === 'meeting' ? 'current' : index < 3 ? 'complete' : ''}>
        <span className="step-dot">{index < 3 ? '✓' : index + 1}</span><div><b>{stages[stage]}</b><small>{stage === 'meeting' ? 'Etapa atual' : '—'}</small></div></li>)}
    </ol>
    <div className="profile-columns">
      <div className="profile-main">
        <section className="card profile-summary dm-rise-in">
          <div className="profile-section-head"><h2><span className="profile-ai-icon"><DIcon name="spark" size={17} /></span>Resumo da IA</h2><button className="profile-link" tabIndex={-1}>Atualizar resumo</button><small>Atualizado agora</small></div>
          <p><Words text={summary} step={22} /></p>
          <small className="crm-note">8 mensagens no histórico · análise do contexto recente e resumo anterior</small>
          <div className="profile-next"><div><span className="eyebrow">PRÓXIMA AÇÃO SUGERIDA</span><p>Levar o plano personalizado para a reunião de {weekdayShort(day)} às 14:30 com a Dra. Helena.</p></div>
            <button className="btn" tabIndex={-1}>Adicionar às notas</button><button className="btn" tabIndex={-1}>Editar</button><button className="btn btn-primary" tabIndex={-1}>Revisar e enviar</button></div>
        </section>
        {step >= 2 && <section className="card profile-history dm-rise-in" key="hist">
          <div className="profile-tabs" role="tablist">{['Atividade', 'Conversa', 'Notas', 'Reuniões', 'Arquivos'].map((t, k) => <button key={t} role="tab" aria-selected={k === 0} tabIndex={-1}>{t}{t === 'Conversa' && <span>8</span>}{t === 'Reuniões' && <span>1</span>}</button>)}</div>
          <div className="profile-timeline">
            {[
              ['target', true, 'Triagem automática atualizada', 'Qualificado · Score 92/100', ''],
              ['spark', true, 'SDR IA respondeu', 'Combinado! Reunião confirmada. Enviei o convite com o link do Meet para o seu e-mail.', stamp('02:17')],
              ['message', false, 'Beatriz Nogueira enviou uma mensagem', `${weekdayShort(day).charAt(0).toUpperCase() + weekdayShort(day).slice(1)} às 14:30 😍`, stamp('02:17')],
              ['message', false, 'Beatriz Nogueira enviou uma mensagem', 'Oi! Vi o anúncio de vocês no Instagram. Vocês fazem avaliação de harmonização facial?', stamp('02:14')],
              ['users', false, 'Lead criado', 'Origem: Instagram Ads', ''],
            ].map(([icon, ai, title, text, time], index) => <article key={`${title}${index}`} style={{ animation: `dmIn .5s var(--ease) ${index * 120 + 100}ms both` }}>
              <span className={`timeline-icon ${ai ? 'ai' : ''}`}><DIcon name={icon as 'target'} size={15} /></span>
              <div><div className="profile-section-head"><b>{title}</b>{time && <time>{time}</time>}</div><p>{text}</p></div></article>)}
          </div>
        </section>}
      </div>
      <aside className="profile-details" aria-label="Dados e qualificação">
        {step >= 1 && <section className="card profile-score-card dm-rise-in" key="score">
          <div className="profile-section-head"><h2>SCORE DE QUALIFICAÇÃO</h2><button className="profile-link" tabIndex={-1}>Ver critérios</button></div>
          <div className="profile-score"><strong><Count to={92} ms={900} /></strong><span>/ 100</span><span className="badge badge-success">Qualificado</span></div>
          {criteria.map(([label, value, evidence], index) => <div className="profile-criterion" key={label}>
            <div><span>{label}</span><b>{value}</b></div>
            <div className="criterion-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><i style={{ width: `${value}%`, animation: `dmGrow 1.1s var(--ease) ${index * 140 + 200}ms both`, transformOrigin: 'left' }} /></div>
            <p>{evidence}</p></div>)}
          <p className="crm-note">Média dos quatro critérios. A qualificação exige os quatro critérios e o limiar definido no agente.</p>
        </section>}
        <section className="card profile-deals-card dm-rise-in" style={{ animationDelay: step >= 1 ? '0ms' : '150ms' }}>
          <div className="profile-section-head"><h2>OPORTUNIDADES</h2><button className="profile-link" tabIndex={-1}>+ Nova</button></div>
          <ul className="profile-deal-list"><li><a href="#pipeline" tabIndex={-1}><b>Harmonização · Beatriz Nogueira</b><small>{brl(4000)} · {stages.meeting}</small></a></li></ul>
        </section>
        <section className="card profile-contact-card dm-rise-in" style={{ animationDelay: '250ms' }}>
          <div className="profile-section-head"><h2>DADOS DE CONTATO</h2><button className="profile-link" tabIndex={-1}>Editar</button></div>
          <dl>{[['Telefone', '+55 11 9 •••• 4821'], ['E-mail', 'bea•••@email.com'], ['Empresa', 'Não informado'], ['Cargo', 'Não informado'], ['Cidade', 'Não informado'], ['Origem', 'Instagram Ads']].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </section>
      </aside>
    </div>
  </div>;
}

/* ============ Reuniões (mesma estrutura de src/pages/Meetings.tsx) ============ */
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
  const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}T14:30`;
  const actions = <div className="v2-row-actions"><span className="v2-btn" aria-hidden="true"><DIcon name="download" size={16} />Baixar .ics</span><span className="v2-btn" aria-hidden="true"><DIcon name="edit" size={16} />Editar</span><span className="v2-btn v2-icon-btn v2-danger" aria-hidden="true"><DIcon name="trash" size={16} /></span></div>;
  return <div className="content v2-page dm-meet" data-step={step}>
    <div className="page-header"><div><h1 className="page-title">Reuniões</h1><p className="page-description">Organize conversas comerciais e registre os resultados.</p></div>
      <div className="page-actions"><button className="v2-primary" tabIndex={-1}><DIcon name="plus" size={16} /> Agendar reunião</button></div></div>
    <div className="v2-stats"><div><span>Próximas reuniões</span><b className="accent"><Count to={3} ms={700} /></b><small>Agendadas para o futuro</small></div><div><span>Realizadas</span><b>1</b><small>Resultados registrados</small></div><div><span>Canceladas</span><b>0</b><small>Canceladas na plataforma</small></div><div><span>Total de reuniões</span><b>4</b><small>Todo o histórico</small></div></div>
    <div className="v2-body">
      <div className="v2-card v2-list">
        <div className="v2-tabs" role="tablist">{[['Todas', 4, true], ['Próximas', 3, false], ['Realizadas', 1, false], ['Canceladas', 0, false]].map(([l, n, a]) => <button key={l as string} className={`v2-tab ${a ? 'active' : ''}`} tabIndex={-1}>{l}<span className="v2-count">{n}</span></button>)}</div>
        <Hot on={step === 0} go={go} hint="Abrir a reunião" className="dm-meeting-wrap" radius="16px">
          <article className="v2-meeting dm-new-meeting">
            <div className="v2-date" aria-hidden="true"><span>{mine.month}</span><b>{mine.day}</b></div>
            <div className="v2-meeting-info"><div className="v2-title-row"><h2>Avaliação · Beatriz Nogueira</h2><span className="v2-pill"><i />Agendada</span><span className="v2-pill ai">Agendada pela IA</span></div>
              <div className="v2-meta"><span><DIcon name="clock" size={15} />14:30 · 30 min</span><span><DIcon name="globe" size={15} />Brasília (GMT-3)</span><span><DIcon name="user" size={15} />Beatriz Nogueira</span><span className="v2-location"><DIcon name="link" size={15} />meet.google.com/abc-defg-hij</span></div></div>
            {actions}
          </article>
        </Hot>
        {list.map((m) => { const b = block(m.d); return <article className="v2-meeting" key={m.title}>
          <div className={`v2-date ${m.state}`} aria-hidden="true"><span>{b.month}</span><b>{b.day}</b></div>
          <div className="v2-meeting-info"><div className="v2-title-row"><h2>{m.title}</h2><span className={`v2-pill ${m.state}`}><i />{m.state === 'completed' ? 'Realizada' : 'Agendada'}</span>{m.ai && <span className="v2-pill ai">Agendada pela IA</span>}</div>
            <div className="v2-meta"><span><DIcon name="clock" size={15} />{m.time} · 30 min</span><span><DIcon name="globe" size={15} />Brasília (GMT-3)</span><span><DIcon name="user" size={15} />{m.who}</span></div></div>{actions}</article>; })}
        <div className="v2-hint"><DIcon name="spark" size={18} /><span>Reuniões marcadas pela IA aparecem aqui automaticamente, com link do Meet e convite enviado ao lead.</span></div>
      </div>
      <aside className="v2-side">
        <div className="card calendar-connect"><div className="calendar-connect-main"><span className="channel-mark google" aria-hidden="true">G</span><div><b>Minha agenda Google <span className="badge badge-success">Conectada</span></b><p>helena@clinica.com · A IA oferece seus horários livres e cria o evento.</p></div></div><button className="btn" tabIndex={-1}>Desconectar</button></div>
        <div className="v2-card v2-cal"><div className="v2-cal-head"><b>{month.charAt(0).toUpperCase() + month.slice(1)}</b><div><button type="button" tabIndex={-1} aria-label="Mês anterior"><DIcon name="chevronLeft" size={18} /></button><button type="button" tabIndex={-1} aria-label="Próximo mês"><DIcon name="chevron" size={18} /></button></div></div>
          <div className="v2-cal-grid v2-cal-week" aria-hidden="true">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="v2-cal-grid">{cells.map((n, i) => n ? <span key={i} className={`v2-day ${n === today ? 'today' : ''} ${marked.has(n) ? 'has' : ''}`}>{n}</span> : <span key={i} />)}</div></div>
        <p className="v2-tz"><DIcon name="info" size={14} /><span>Horários exibidos em Brasília (America/Sao_Paulo). Para reuniões manuais, exporte o arquivo .ics.</span></p>
      </aside>
    </div>
    {step >= 1 && <div className="modal-overlay" key="modal"><div className="modal crm-modal" role="dialog" aria-modal="true" aria-label="Editar reunião"><div className="modal-head"><div><h2 className="page-title">Editar reunião</h2><span>Cadastre os dados do compromisso.</span></div><span className="btn btn-ghost" aria-hidden="true">✕</span></div>
      <div className="modal-body">
        <label><span>Título *</span><input readOnly tabIndex={-1} value="Avaliação · Beatriz Nogueira" /></label>
        <label><span>Contato</span><select tabIndex={-1} value="b" onChange={() => {}}><option value="b">Beatriz Nogueira</option></select></label>
        <label><span>Data e horário *</span><input readOnly tabIndex={-1} value={iso.replace('T', ' ')} /><small className="crm-form-help">Digite o horário no fuso do seu dispositivo. A lista será convertida para Brasília.</small></label>
        <div className="form-grid"><label><span>Duração em minutos *</span><input readOnly tabIndex={-1} value="30" /></label><label><span>Status</span><select tabIndex={-1} value="s" onChange={() => {}}><option value="s">Agendada</option></select></label></div>
        <label><span>Local ou link da reunião</span><input readOnly tabIndex={-1} value="meet.google.com/abc-defg-hij" /></label></div>
      <div className="modal-footer"><span className="btn" aria-hidden="true">Cancelar</span><span className="btn btn-primary" aria-hidden="true">Salvar reunião</span></div></div></div>}
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

import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Avatar } from '../components/ui';
import { Count, DIcon, Hot, initials, meetingDay, useCount, weekdayShort } from './ui';

type Msg = { who: 'lead' | 'ai' | 'human' | 'event'; text: string; time: string; slots?: boolean };
export type SceneProps = { step: number; company: string; go: () => void };

/** Conversa roteirizada. Os textos não prometem preço: a Felipa só usa o que está na base de conhecimento. */
function script(company: string, day: Date): Msg[] {
  const slot = `${weekdayShort(day)} ${day.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return [
    { who: 'lead', time: '02:14', text: 'Oi! Vi o anúncio de vocês no Instagram. Vocês fazem avaliação de harmonização facial?' },
    { who: 'ai', time: '02:14', text: `Oi, Beatriz! Aqui é a Felipa, assistente virtual da ${company}. Fazemos sim 😊 A avaliação é feita com a nossa especialista e você sai com um plano personalizado. É para algo específico que você está pensando?` },
    { who: 'lead', time: '02:15', text: 'Quero sim, mas preciso saber valores. Tenho pressa, é para o casamento da minha irmã em dezembro.' },
    { who: 'ai', time: '02:15', text: 'Que momento especial! Dezembro dá tempo de sobra para um bom resultado. Os valores dependem do que a especialista indicar na avaliação. Para eu te orientar melhor: você já tem uma faixa de investimento em mente?' },
    { who: 'lead', time: '02:16', text: 'Até uns R$ 4 mil. Decido sozinha, não preciso consultar ninguém.' },
    { who: 'ai', time: '02:16', text: 'Perfeito, Beatriz! Dentro dessa faixa conseguimos montar um bom plano. Vou separar horários com a Dra. Helena para você.' },
    { who: 'event', time: '02:16', text: 'Oportunidade criada no funil · Qualificado · R$ 4.000' },
    { who: 'ai', time: '02:17', slots: true, text: 'Tenho estes horários livres para a avaliação (30 min, por vídeo). Qual prefere?' },
    { who: 'lead', time: '02:17', text: `${slot.charAt(0).toUpperCase() + slot.slice(1)} 😍` },
    { who: 'ai', time: '02:17', text: `Combinado! Reunião confirmada para ${weekdayShort(day)} às 14:30. Enviei o convite com o link do Meet por e-mail e você recebe um lembrete aqui no WhatsApp na véspera.` },
    { who: 'event', time: '02:17', text: `Reunião agendada · ${slot} · convite e link do Meet enviados` },
  ];
}
const upto = [0, 2, 4, 7, 11];
const fromIndex = [0, 0, 2, 4, 7];
const TYPE_MS = 800;

const criteria = [
  { key: 'budget', label: 'Orçamento', at: 3, value: 70, evidence: '“Até uns R$ 4 mil”' },
  { key: 'need', label: 'Necessidade', at: 1, value: 90, evidence: '“Avaliação de harmonização facial”' },
  { key: 'authority', label: 'Autoridade', at: 3, value: 95, evidence: '“Decido sozinha”' },
  { key: 'timing', label: 'Prazo', at: 2, value: 80, evidence: '“Casamento da irmã em dezembro”' },
] as const;
const scoreByLevel = [0, 20, 58, 92, 92];
const statusByLevel = ['', 'Novo lead', 'Em qualificação', 'Qualificado · quente', 'Reunião agendada'];

const others = [
  { name: 'Rafael Menezes', time: '23:40', preview: 'Perfeito, obrigado! Vou aguardar.', status: 'ai', unread: 0 },
  { name: 'Juliana Prado', time: '21:05', preview: 'Qual o valor do pacote facial?', status: 'ai', unread: 2 },
  { name: 'Carlos Eduardo', time: '18:22', preview: 'Pode me ligar amanhã cedo?', status: 'human', unread: 0 },
  { name: 'Patrícia Lima', time: 'Ontem', preview: 'Reunião confirmada para sexta 🙌', status: 'ai', unread: 0 },
];

/** `flow`: capítulo "A IA atende" (passos 0 a 4). `handoff`: capítulo "Você no controle" (0 = IA ativa, 1 = humano assumiu). */
export default function InboxScene({ step, company, go, mode = 'flow' }: SceneProps & { mode?: 'flow' | 'handoff' }) {
  const day = useMemo(meetingDay, []);
  const messages = useMemo(() => script(company, day), [company, day]);
  const level = mode === 'flow' ? step : 4;
  const shown = mode === 'flow' ? upto[step] : messages.length;
  const from = mode === 'flow' ? fromIndex[step] : messages.length;
  const human = mode === 'handoff' && step === 1;
  const selected = level >= 1;
  const score = useCount(scoreByLevel[level], 900);
  const box = useRef<HTMLDivElement>(null);

  // Atraso de cada mensagem nova: o lead escreve, a IA "digita" e então responde.
  const delays = useMemo(() => {
    const result: number[] = []; let t = 150;
    for (let index = from; index < shown; index++) {
      const msg = messages[index]; result[index] = t;
      t += msg.who === 'ai' ? TYPE_MS + 500 : msg.who === 'event' ? 450 : 650;
    }
    return result;
  }, [messages, from, shown]);
  const humanDelay = (delays.length ? Math.max(...delays.filter((v) => v !== undefined)) : 0) + 700;

  useEffect(() => {
    const el = box.current; if (!el) return;
    const timers = [120, 900, 1800, 3000, 4200].map((ms) => window.setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }), ms));
    return () => timers.forEach(window.clearTimeout);
  }, [step, mode]);

  const last = messages[Math.max(0, Math.min(shown, messages.length) - 1)];
  const preview = shown ? (last.who === 'event' ? messages[shown - 2].text : last.text) : 'Oi! Vi o anúncio de vocês no Instagram…';
  const meetingLabel = `${weekdayShort(day)} · 14:30`;

  return <div className="dm-inbox inbox-page" data-level={level}>
    {/* Lista de conversas */}
    <section className="conversation-column" aria-label="Conversas">
      <div className="conversation-title"><div><b>Caixa de entrada</b><span className="badge badge-neutral">12</span></div><DIcon name="filter" size={16} /></div>
      <div className="search-box"><DIcon name="search" size={15} /><span className="dm-ph">Buscar contato ou empresa…</span></div>
      <div className="inbox-tabs"><button className="active">Todas</button><button>IA</button><button>Humano</button></div>
      <div className="conversation-list">
        <Hot on={mode === 'flow' && step === 0} go={go} hint="Abrir a conversa nova" className="dm-conv-wrap" radius="12px">
          <button className={`conversation-item dm-new-conv ${selected ? 'active' : ''}`} tabIndex={-1}>
            <span className="avatar tone-0">BN</span>
            <span className="conversation-copy">
              <div><b>Beatriz Nogueira</b><time>02:14</time></div>
              <span>{preview}</span>
              <div><span className={`badge ${human ? 'badge-warning' : 'badge-success'}`}>{human ? 'Humano' : 'IA ativa'}</span><small><DIcon name="instagram" size={12} /> Instagram Ads</small></div>
            </span>
            {step === 0 && mode === 'flow' && <i className="unread">1</i>}
          </button>
        </Hot>
        {others.map((c, index) => <button key={c.name} className="conversation-item" tabIndex={-1}>
          <Avatar name={c.name} tone={`tone-${(index + 1) % 5}`} />
          <span className="conversation-copy">
            <div><b>{c.name}</b><time>{c.time}</time></div>
            <span>{c.preview}</span>
            <div><span className={`badge ${c.status === 'ai' ? 'badge-success' : 'badge-warning'}`}>{c.status === 'ai' ? 'IA ativa' : 'Humano'}</span></div>
          </span>
          {c.unread > 0 && <i className="unread">{c.unread}</i>}
        </button>)}
      </div>
    </section>

    {/* Conversa */}
    <section className="chat-column" aria-label="Conversa">
      {!selected ? <div className="dm-empty"><span className="dm-empty-ico"><DIcon name="message" size={26} /></span><b>Selecione uma conversa</b><p>As mensagens de todos os canais chegam aqui, já com a IA atendendo.</p></div> : <>
        <div className="chat-head">
          <div className="contact-title"><Avatar name="Beatriz Nogueira" tone="tone-0" /><div><b>Beatriz Nogueira</b><span><i className="online-dot" /> WhatsApp · via Instagram Ads</span></div></div>
          <div className="chat-actions">
            {mode === 'flow' && <span className="dm-speed" key={step}><DIcon name="bolt" size={13} /> 1ª resposta em <Count to={8} suffix="s" ms={700} /></span>}
            <span className={`badge ${human ? 'badge-warning' : 'badge-success'}`}>{human ? 'Atendimento humano' : 'Felipa · IA atendendo'}</span>
          </div>
        </div>
        <div className={`handoff-strip dm-handoff ${human ? 'human' : ''}`}>
          <DIcon name={human ? 'user' : 'spark'} size={14} />
          <span>{human ? 'Você assumiu esta conversa. A IA está pausada e o histórico continua.' : 'A Felipa está atendendo. Você pode assumir quando quiser.'}</span>
          {mode === 'handoff' && (human
            ? <button className="btn btn-sm" tabIndex={-1}>Retomar IA</button>
            : <Hot on={step === 0} go={go} hint="Assumir como humano" className="dm-inline" radius="999px"><button className="btn btn-sm" tabIndex={-1}>Assumir como humano</button></Hot>)}
        </div>
        <div className="messages" ref={box}>
          <div className="day-divider"><span>Hoje · madrugada</span></div>
          {messages.slice(0, shown).map((m, index) => {
            const fresh = index >= from && delays[index] !== undefined;
            const d = delays[index] ?? 0;
            if (m.who === 'event') return <div key={index} className={`system-event ${fresh ? 'dm-in' : ''}`} style={{ '--d': `${d}ms` } as CSSProperties}><DIcon name={index === 6 ? 'pipeline' : 'calendar'} size={13} /> {m.text}</div>;
            const cls = m.who === 'lead' ? 'lead' : 'ai';
            return <div key={index} className="dm-msg">
              {fresh && m.who === 'ai' && <div className="message-wrap ai dm-typing" style={{ '--d': `${d}ms`, '--t': `${TYPE_MS}ms` } as CSSProperties}><div className="message dm-dots"><i /><i /><i /></div></div>}
              <div className={`message-wrap ${cls} ${fresh ? 'dm-in' : ''}`} style={fresh ? ({ '--d': `${d + (m.who === 'ai' ? TYPE_MS : 0)}ms` } as CSSProperties) : undefined}>
                <div className="message-author">{m.who === 'lead' ? 'Beatriz' : <><DIcon name="spark" size={11} /> Felipa · IA</>}</div>
                <div className="message">{m.text}
                  {m.slots && <div className="dm-slots"><span className="active">{weekdayShort(day)} 14:30</span><span>{weekdayShort(new Date(day.getTime() + 86400000))} 10:00</span></div>}
                  <time>{m.time}</time></div>
              </div>
            </div>;
          })}
          {human && <div className="message-wrap human dm-in" style={{ '--d': `${Math.max(humanDelay, 500)}ms` } as CSSProperties}>
            <div className="message-author">Helena · equipe</div>
            <div className="message">Oi, Beatriz! Aqui é a Helena, da {company}. Vi que você quer se preparar para dezembro. Vou deixar um plano personalizado pronto para a nossa conversa.<time>09:12</time></div>
          </div>}
        </div>
        <div className="composer">
          <div className="composer-tabs"><button className="active">Responder</button><button>Nota interna</button></div>
          <div className={`composer-box dm-composer ${human ? 'on' : ''}`}>
            <div className="dm-composer-text">{human ? 'Oi, Beatriz! Aqui é a Helena…' : 'A Felipa está respondendo. Assuma a conversa para escrever.'}</div>
            <div><span className="dm-composer-hint"><DIcon name="whatsapp" size={14} /> Envia pelo WhatsApp</span><button className={`btn ${human ? 'btn-primary' : ''} btn-sm`} tabIndex={-1} disabled={!human}>Enviar</button></div>
          </div>
        </div>
      </>}
    </section>

    {/* Ficha preenchida pela IA */}
    <aside className="lead-panel" aria-label="Ficha do lead">
      <div className="panel-head"><b>Ficha do lead</b>{selected && <span className="badge badge-brand dm-pop" key={level}><DIcon name="spark" size={11} /> Preenchida pela IA</span>}</div>
      {!selected ? <div className="dm-empty small"><b>Sem lead selecionado</b><p>A ficha é criada e atualizada sozinha a cada mensagem.</p></div> : <>
        <div className="lead-hero">
          <Avatar name="Beatriz Nogueira" tone="tone-0" />
          <div className="lead-name">Beatriz Nogueira</div>
          <div className="dm-muted">{company} · Instagram Ads</div>
          <div className="lead-badges"><span className="badge badge-info dm-pop" key={`s${level}`}>{statusByLevel[level]}</span>{level >= 3 && <span className="badge badge-danger dm-pop">🔥 Quente</span>}</div>
        </div>
        <div className="score-block">
          <div><span>Score do lead</span><b className="dm-score">{Math.round(score)}</b></div>
          <div className="score-track"><i style={{ width: `${score}%` }} className={score >= 75 ? 'hot' : ''} /></div>
          <span>{level >= 3 ? 'Acima da nota de corte (75): encaminhar para reunião' : 'Calculando conforme as respostas…'}</span>
        </div>
        <div className="panel-section">
          <div className="section-label">DADOS CAPTURADOS</div>
          {[['Telefone', '+55 11 9•••• 4821', 1], ['Origem', 'Instagram Ads', 1], ['Interesse', 'Harmonização facial', 1], ['Prazo', 'Dezembro', 2], ['Orçamento', 'Até R$ 4.000', 3], ['Decisão', 'Decide sozinha', 3], ['Reunião', meetingLabel, 4]].map(([label, value, at]) =>
            level >= (at as number) ? <div className="data-row dm-flash" key={`${label}${level >= (at as number)}`}><span>{label}</span><b>{value}</b></div> : null)}
        </div>
        <div className="panel-section">
          <div className="section-label">CRITÉRIOS DE QUALIFICAÇÃO</div>
          {criteria.map((c) => {
            const on = level >= c.at;
            return <div className={`dm-crit ${on ? 'on' : ''}`} key={c.key}>
              <div><span>{c.label}</span><b>{on ? `${c.value}%` : '—'}</b></div>
              <div className="score-track"><i style={{ width: on ? `${c.value}%` : '0%' }} /></div>
              {on && <small className="dm-flash">{c.evidence}</small>}
            </div>;
          })}
        </div>
        <div className="panel-section">
          <div className="recommendation"><DIcon name="bolt" size={15} /><span><b>Próxima ação recomendada</b>{level < 3 ? 'Descobrir orçamento e quem decide.' : level === 3 ? 'Oferecer horários para a avaliação com a Dra. Helena.' : 'Reunião marcada. O lembrete sai automaticamente na véspera.'}</span></div>
        </div>
      </>}
    </aside>

    {mode === 'flow' && step === 0 && <div className="dm-toast" role="status"><span className="dm-toast-ico"><DIcon name="bell" size={16} /></span><div><b>Novo lead · Instagram Ads</b><small>Beatriz Nogueira · agora, 02:14</small></div></div>}
    <span className="dm-sr">{initials('Beatriz Nogueira')}</span>
  </div>;
}

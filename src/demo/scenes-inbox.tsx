import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Avatar } from '../components/ui';
import { Hot, meetingDay, weekdayShort } from './ui';

type Msg = { who: 'lead' | 'ai'; text: string; time: string };
export type SceneProps = { step: number; company: string; go: () => void };

/** Conversa roteirizada. Os textos não prometem preço: a Felipa só usa o que está na base de conhecimento. */
function script(company: string, day: Date): Msg[] {
  const w = weekdayShort(day);
  const next = weekdayShort(new Date(day.getTime() + 86400000));
  return [
    { who: 'lead', time: '02:14', text: 'Oi! Vi o anúncio de vocês no Instagram. Vocês fazem avaliação de harmonização facial?' },
    { who: 'ai', time: '02:14', text: `Oi, Beatriz! Aqui é a Felipa, assistente virtual da ${company}. Fazemos sim 😊 A avaliação é feita com a nossa especialista e você sai com um plano personalizado. É para algo específico que você está pensando?` },
    { who: 'lead', time: '02:15', text: 'Quero sim, mas preciso saber valores. Tenho pressa, é para o casamento da minha irmã em dezembro.' },
    { who: 'ai', time: '02:15', text: 'Que momento especial! Dezembro dá tempo de sobra para um bom resultado. Os valores dependem do que a especialista indicar na avaliação. Para eu te orientar melhor: você já tem uma faixa de investimento em mente?' },
    { who: 'lead', time: '02:16', text: 'Até uns R$ 4 mil. Decido sozinha, não preciso consultar ninguém.' },
    { who: 'ai', time: '02:16', text: `Perfeito, Beatriz! Dentro dessa faixa conseguimos montar um bom plano. Tenho horários livres com a Dra. Helena para a avaliação (30 min, por vídeo): ${w} às 14:30 ou ${next} às 10:00. Qual prefere?` },
    { who: 'lead', time: '02:17', text: `${w.charAt(0).toUpperCase() + w.slice(1)} às 14:30 😍` },
    { who: 'ai', time: '02:17', text: `Combinado! Reunião confirmada para ${w} às 14:30. Enviei o convite com o link do Meet para o seu e-mail.` },
  ];
}
const upto = [0, 2, 4, 6, 8];
const TYPE_MS = 800;
const stamp = (time: string) => `${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${time}`;

const others = [
  { name: 'Rafael Menezes', co: 'Diagnóstico', preview: 'Perfeito, obrigado! Vou aguardar.', status: 'ai' },
  { name: 'Juliana Prado', co: 'Pacote facial', preview: 'Qual o valor do pacote facial?', status: 'ai' },
  { name: 'Carlos Eduardo', co: 'Lentes', preview: 'Pode me ligar amanhã cedo?', status: 'human' },
  { name: 'Patrícia Lima', co: 'Bioestimulador', preview: 'Reunião confirmada para sexta 🙌', status: 'ai' },
];

/** Mesma estrutura da Caixa de entrada real (`ai-inbox`). `flow`: passos 0 a 4. `handoff`: 0 = IA ativa, 1 = humano assumiu. */
export default function InboxScene({ step, company, go, mode = 'flow' }: SceneProps & { mode?: 'flow' | 'handoff' }) {
  const day = useMemo(meetingDay, []);
  const messages = useMemo(() => script(company, day), [company, day]);
  const selected = mode === 'handoff' || step >= 1;
  const shown = mode === 'flow' ? upto[step] : messages.length;
  const from = mode === 'flow' ? (step >= 1 ? upto[step - 1] : 0) : messages.length;
  const human = mode === 'handoff' && step === 1;
  const box = useRef<HTMLDivElement>(null);

  const delays = useMemo(() => {
    const result: number[] = []; let t = 150;
    for (let index = from; index < shown; index++) { result[index] = t; t += messages[index].who === 'ai' ? TYPE_MS + 500 : 650; }
    return result;
  }, [messages, from, shown]);
  const humanDelay = 400;

  useEffect(() => {
    const el = box.current; if (!el) return;
    const timers = [120, 900, 1800, 3000, 4200].map((ms) => window.setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }), ms));
    return () => timers.forEach(window.clearTimeout);
  }, [step, mode]);

  const lastText = shown ? messages[shown - 1].text : 'Oi! Vi o anúncio de vocês no Instagram…';
  const badge = human ? 'badge-warning' : 'badge-success';

  return <div className={`dm-inbox ai-inbox ${selected ? 'ai-inbox-selected' : ''}`}>
    <aside className="ai-conversations" aria-label="Lista de conversas">
      <div className="ai-conversation-heading"><h1>Caixa de entrada</h1><button className="btn btn-primary" tabIndex={-1}>+ Nova</button></div>
      <div className="ai-conversation-search"><label className="ai-field"><span className="ai-sr-only">Buscar conversas</span><input placeholder="Buscar contato ou empresa…" readOnly tabIndex={-1} /></label></div>
      <p className="ai-conversation-note">Todos os canais · 5 conversas</p>
      <div className="ai-conversation-list">
        <Hot on={mode === 'flow' && step === 0} go={go} hint="Abrir a conversa nova" className="dm-conv-wrap" radius="12px">
          <button className={`ai-conversation-item ${selected ? 'selected' : ''}`} tabIndex={-1}>
            <Avatar name="Beatriz Nogueira" tone="tone-0" />
            <span className="ai-conversation-copy"><b>Beatriz Nogueira</b><small>Instagram Ads</small><span>{lastText}</span><span className={`badge ${badge}`}>{human ? 'Atendimento humano' : 'IA ativa'}</span></span>
          </button>
        </Hot>
        {others.map((c, index) => <button key={c.name} className="ai-conversation-item" tabIndex={-1}>
          <Avatar name={c.name} tone={`tone-${(index + 1) % 5}`} />
          <span className="ai-conversation-copy"><b>{c.name}</b><small>{c.co}</small><span>{c.preview}</span><span className={`badge ${c.status === 'ai' ? 'badge-success' : 'badge-warning'}`}>{c.status === 'ai' ? 'IA ativa' : 'Atendimento humano'}</span></span>
        </button>)}
      </div>
    </aside>

    <section className="ai-inbox-chat" aria-label="Histórico da conversa">
      {!selected ? <div className="ai-empty ai-inbox-welcome"><span className="ai-empty-symbol" aria-hidden="true">↗</span><h2>O atendimento começa aqui</h2><p>Selecione uma conversa ou crie um atendimento interno.</p><p className="ai-muted">Mensagens dos canais conectados aparecem aqui automaticamente quando a integração está ativa. Apenas números autorizados acionam a IA.</p></div> : <>
        <div className="ai-inbox-heading"><div><h2>Beatriz Nogueira</h2><span>Felipa · WhatsApp</span></div><span className={`badge ${badge}`}>{human ? 'Atendimento humano' : 'IA ativa'}</span></div>
        <div className="ai-inbox-controls"><p>{human ? 'Atendimento humano: suas respostas serão enviadas pelo canal whatsapp.' : 'A Felipa responde aos números autorizados. Assuma para responder pessoalmente.'}</p>
          <div className="ai-actions">
            {human ? <button className="btn" tabIndex={-1}>Retomar IA</button>
              : <Hot on={mode === 'handoff' && step === 0} go={go} hint="Assumir como humano" className="dm-inline" radius="999px"><button className="btn" tabIndex={-1}>Assumir como humano</button></Hot>}
            <button className="btn" tabIndex={-1}>Encerrar</button><button className="btn btn-danger" tabIndex={-1}>Excluir</button></div></div>
        <div className="ai-chat-messages" ref={box}>
          {messages.slice(0, shown).map((m, index) => {
            const fresh = index >= from && delays[index] !== undefined;
            const d = delays[index] ?? 0;
            const role = m.who === 'lead' ? 'user' : 'assistant';
            return <div key={index} className="dm-msg">
              {fresh && m.who === 'ai' && <div className="ai-chat-bubble assistant dm-typing" style={{ '--d': `${d}ms`, '--t': `${TYPE_MS}ms` } as CSSProperties}><div className="dm-dots"><i /><i /><i /></div></div>}
              <div className={`ai-chat-bubble ${role} ${fresh ? 'dm-in' : ''}`} style={fresh ? ({ '--d': `${d + (m.who === 'ai' ? TYPE_MS : 0)}ms` } as CSSProperties) : undefined}>
                <span>{m.who === 'lead' ? 'Beatriz Nogueira' : 'Felipa · IA'}</span><p>{m.text}</p><time>{stamp(m.time)}</time>
              </div>
            </div>;
          })}
          {human && <div className="ai-chat-bubble human dm-in" style={{ '--d': `${humanDelay}ms` } as CSSProperties}>
            <span>Você · Atendimento humano</span><p>Oi, Beatriz! Aqui é a Helena, da {company}. Vou deixar um plano personalizado pronto para a nossa conversa.</p><time>{stamp('09:12')}</time></div>}
        </div>
        <div className="ai-chat-composer">
          <label className="ai-field"><span>{human ? 'Sua resposta como atendente' : 'Mensagem do cliente de teste'}</span>
            <textarea rows={3} readOnly tabIndex={-1} disabled={!human} value={human ? 'Combinado, Beatriz! Nos vemos na avaliação.' : ''} placeholder={human ? 'Digite sua resposta…' : 'Simule uma mensagem recebida do lead…'} /></label>
          <div className="ai-actions"><small className="ai-muted">Envio pelo canal whatsapp · atendimento humano</small><button className={`btn ${human ? 'btn-primary' : ''}`} tabIndex={-1} disabled={!human}>{human ? 'Enviar pelo WhatsApp' : 'Enviar ao agente'}</button></div>
        </div>
      </>}
    </section>
  </div>;
}

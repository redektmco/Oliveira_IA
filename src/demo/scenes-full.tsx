import type { CSSProperties } from 'react';
import { Count, DIcon, initials } from './ui';

type Props = { step: number; company: string; go: () => void };

/* ============ Capa ============ */
export function Cover({ company, setCompany, start }: { company: string; setCompany: (value: string) => void; start: () => void }) {
  return <section className="dm-full dm-cover" aria-label="Capa">
    <div className="dm-orb o1" /><div className="dm-orb o2" />
    <div className="dm-cover-top">
      <img className="brand-logo on-dark" src="/brand/logo-light.svg" alt="V4 Oliveira & Co" />
      <img className="brand-logo on-light" src="/brand/logo-dark.svg" alt="V4 Oliveira & Co" />
      <span className="dm-tag"><i /> Demonstração guiada</span>
    </div>
    <div className="dm-cover-body">
    <div className="dm-cover-main">
      <span className="dm-badge dm-rise" style={{ '--d': '0ms' } as CSSProperties}><i /> SDR com IA + CRM completo para vendas</span>
      <h1>
        <span className="dm-line"><span style={{ '--d': '120ms' } as CSSProperties}>Seu SDR de IA</span></span>
        <span className="dm-line"><span style={{ '--d': '240ms' } as CSSProperties}>que nunca perde</span></span>
        <span className="dm-line red"><span style={{ '--d': '360ms' } as CSSProperties}>um lead.</span></span>
      </h1>
      <p className="dm-rise" style={{ '--d': '520ms' } as CSSProperties}>Atende no WhatsApp, Instagram e e-mail em segundos, qualifica cada contato e agenda a reunião direto na agenda do seu time. Tudo dentro de um CRM feito para vender.</p>
      <form className="dm-cover-form dm-rise" style={{ '--d': '640ms' } as CSSProperties} onSubmit={(event) => { event.preventDefault(); start(); }}>
        <label><span>Preparada para</span><input value={company} onChange={(event) => setCompany(event.target.value)} maxLength={40} aria-label="Nome da empresa do cliente" spellCheck={false} /></label>
        <button type="submit" className="dm-cta">Iniciar demonstração <DIcon name="arrow" size={18} /></button>
      </form>
      <small className="dm-rise" style={{ '--d': '760ms' } as CSSProperties}>→ ou Espaço avançam · ← volta · P abre o painel da apresentadora · H esconde os controles</small>
    </div>
    <div className="dm-cover-visual dm-rise" style={{ '--d': '700ms' } as CSSProperties} aria-hidden="true">
      <div className="dm-cover-stage" />
      <div className="dm-mini">
        <div className="dm-mini-head"><span className="dm-av">BN</span><div><b>Beatriz Nogueira</b><small>WhatsApp · 02:14</small></div><span className="dm-chip-live"><i /> IA atendendo</span></div>
        <div className="dm-mini-chat">
          <div className="dm-bub lead">Oi! Vi o anúncio de vocês. Fazem avaliação?</div>
          <div className="dm-bub ia">Oi, Beatriz! Aqui é a Felipa 😊 Fazemos sim. É para algo específico?</div>
        </div>
      </div>
      <div className="dm-float c1"><span className="dm-ic green"><DIcon name="user" size={18} /></span><div><b>Lead qualificado</b><small>Score 92 · pronto para reunião</small></div></div>
      <div className="dm-float c2"><span className="dm-ic red"><DIcon name="calendar" size={18} /></span><div><b>Reunião agendada</b><small>Quinta às 14:30</small></div></div>
      <div className="dm-float c3"><span className="dm-ic ink"><DIcon name="bolt" size={18} /></span><div><b>Resposta em 8s</b><small>Via WhatsApp, às 02:14</small></div></div>
    </div>
    </div>
  </section>;
}

/* ============ O problema ============ */
const queue = [
  { time: '02:14', name: 'Beatriz Nogueira', channel: 'Instagram', wait: '4h12' },
  { time: '23:40', name: 'Rafael Menezes', channel: 'WhatsApp', wait: '6h46' },
  { time: '21:05', name: 'Juliana Prado', channel: 'Formulário', wait: '9h21' },
  { time: '19:32', name: 'Carlos Eduardo', channel: 'WhatsApp', wait: '10h54' },
  { time: '18:10', name: 'Patrícia Lima', channel: 'E-mail', wait: '12h16' },
];
const headlines = ['Todo lead que espera mais de 5 minutos já esfriou.', 'Enquanto isso, quem responde primeiro, vende.', 'Um SDR. Um CRM. Zero lead esquecido.'];
const leads = [['8', 's', 'Primeira resposta', 'tempo médio, em qualquer canal', ''], ['24', '/7', 'Atendimento contínuo', 'sem folga, feriado ou fila de espera', ''], ['3', 'x', 'Mais reuniões', 'agendadas com leads realmente qualificados', ''], ['70', '%', 'Custo por lead qualificado', 'comparado a uma equipe de SDRs', '-']] as const;

export function Problem({ step, company }: Props) {
  return <section className="dm-full dm-dark dm-problem" data-step={step} aria-label="O problema">
    <div className="dm-dglow" />
    <div className="dm-problem-grid">
      <div className="dm-problem-copy">
        <span className="dm-label">(01) O problema</span>
        <h2 key={step} className="dm-big dm-swap">{headlines[step]}</h2>
        <p className="dm-lead">{step === 2 ? `A SDR AI assume a fila inteira da ${company}, qualifica e entrega ao vendedor só oportunidades com reunião marcada.` : 'Seu time passa o dia respondendo as mesmas perguntas, esquecendo follow-ups e perdendo venda para quem respondeu primeiro.'}</p>
      </div>
      <div className="dm-queue" aria-label="Fila de leads (exemplo ilustrativo)">
        <div className="dm-queue-head">
          <b>Fila de leads · {company}</b>
          <span>{step === 2 ? <><Count to={5} /> de 5 respondidos</> : <>0 de 5 respondidos</>}</span>
        </div>
        {queue.map((lead, index) => <div key={lead.name} className={`dm-queue-row ${step === 1 ? 'cold' : step === 2 ? 'done' : ''}`} style={{ '--i': index } as CSSProperties}>
          <span className="dm-av">{initials(lead.name)}</span>
          <div><b>{lead.name}</b><small>{lead.channel} · chegou às {lead.time}</small></div>
          <span className={`dm-wait ${step === 0 ? 'warn' : step === 1 ? 'cold' : 'ok'}`}>
            {step === 0 ? `Sem resposta · há ${lead.wait.replace('h', 'h ')}min` : step === 1 ? 'Esfriou' : <><DIcon name="check" size={14} /> Respondido em 8s</>}
          </span>
        </div>)}
        <small className="dm-queue-note">Exemplo ilustrativo, não são dados reais.</small>
      </div>
    </div>
    {step === 2 && <div className="dm-stats" key="stats">
      {leads.map(([value, suffix, label, detail, prefix], index) => <div className="dm-stat" key={label} style={{ '--i': index } as CSSProperties}>
        <div className="dm-val"><Count to={Number(value)} prefix={prefix} suffix={suffix} /></div><b>{label}</b><small>{detail}</small>
      </div>)}
    </div>}
  </section>;
}

/* ============ Resultados ============ */
const compare: [string, string, string][] = [
  ['Primeira resposta', 'Minutos ou horas', '8 segundos'], ['Disponibilidade', 'Horário comercial', '24 horas, 7 dias'],
  ['Custo mensal', 'Salário, comissão e encargos', 'Uma fração do custo'], ['Escala', 'Contratar e treinar', 'Ilimitada, na hora'],
  ['Follow-up', 'Depende da disciplina', '100% automático'], ['Dados', 'Planilhas espalhadas', 'CRM atualizado sozinho'],
];
export function Results({ step }: Props) {
  return <section className="dm-full dm-dark dm-results" aria-label="Resultados">
    <div className="dm-dglow" />
    {step === 0 ? <div className="dm-results-inner" key="a">
      <span className="dm-label">(02) Resultados</span>
      <h2 className="dm-big dm-swap">O que muda quando nenhum lead fica sem resposta.</h2>
      <div className="dm-stats big">
        {leads.map(([value, suffix, label, detail, prefix], index) => <div className="dm-stat" key={label} style={{ '--i': index } as CSSProperties}>
          <div className="dm-val"><Count to={Number(value)} prefix={prefix} suffix={suffix} ms={1500} /></div><b>{label}</b><small>{detail}</small>
        </div>)}
      </div>
      <small className="dm-fine">Números de referência da SDR AI. Os resultados dependem da operação de cada cliente.</small>
    </div> : <div className="dm-results-inner" key="b">
      <span className="dm-label">(03) Comparativo</span>
      <h2 className="dm-big dm-swap">SDR humano ou SDR de IA?</h2>
      <div className="dm-table" role="table">
        <div className="dm-tr th" role="row"><span /><span>SDR tradicional</span><span className="ai">SDR AI &amp; CRM</span></div>
        {compare.map(([criterion, old, ai], index) => <div className="dm-tr" role="row" key={criterion} style={{ '--i': index } as CSSProperties}><span>{criterion}</span><span>{old}</span><span className="ai"><DIcon name="check" size={16} /> {ai}</span></div>)}
      </div>
    </div>}
  </section>;
}

/* ============ Fechamento ============ */
const days = [['01', 'Diagnóstico', 'Mapeamos seu produto, seu cliente ideal, as objeções mais comuns e o que define um lead qualificado.', 'Dia 1'],
  ['02', 'Treino da IA', 'Ensinamos o SDR com seu tom de voz, FAQs, materiais e regras de qualificação.', 'Dias 2 a 4'],
  ['03', 'Conexão dos canais', 'WhatsApp, Instagram, e-mail e agenda conectados ao CRM em poucos cliques.', 'Dia 5'],
  ['04', 'Go-live e otimização', 'A IA entra no ar e melhora toda semana com base nas conversas reais.', 'Dia 7']];
const offer = [['SDR com IA treinado no seu negócio', 'Tom de voz, FAQs e regras de qualificação'], ['WhatsApp, Instagram e e-mail', 'Todos os canais em uma só caixa de entrada'], ['CRM completo', 'Funis, contatos, ficha do cliente e score'],
  ['Agendamento automático', 'Integrado ao Google Agenda do seu time'], ['Follow-ups e API aberta', 'Cadências automáticas, API e webhooks'], ['Implantação guiada e suporte humano', 'Do primeiro dia ao go-live']];

export function Closing({ step, company }: Props) {
  if (step === 2) {
    return <section className="dm-full dm-final" aria-label="Próximo passo">
      <div className="dm-final-marq" aria-hidden="true"><div>{Array.from({ length: 8 }).map((_, index) => <span key={index}>Seu próximo cliente já está chamando&nbsp;<em>✦</em>&nbsp;</span>)}</div></div>
      <h2 className="dm-final-h"><span className="dm-line"><span style={{ '--d': '0ms' } as CSSProperties}>Seu próximo</span></span><span className="dm-line"><span style={{ '--d': '120ms' } as CSSProperties}>cliente já está</span></span><span className="dm-line"><span style={{ '--d': '240ms' } as CSSProperties}>chamando.</span></span></h2>
      <div className="dm-final-row dm-rise" style={{ '--d': '500ms' } as CSSProperties}>
        <p>Vamos começar o diagnóstico da {company} e colocar a SDR AI no ar em 7 dias.</p>
        <span className="dm-final-btn">Próximo passo: diagnóstico <DIcon name="arrow" size={20} /></span>
      </div>
    </section>;
  }
  return <section className="dm-full dm-closing" aria-label="Implantação e oferta">
    {step === 0 ? <div className="dm-results-inner" key="steps">
      <span className="dm-label">(04) Como funciona</span>
      <h2 className="dm-big dm-swap">No ar em 7 dias, sem dor de cabeça.</h2>
      <div className="dm-days">
        <div className="dm-days-line"><i /></div>
        {days.map(([n, title, text, when], index) => <article key={n} className="dm-day" style={{ '--i': index } as CSSProperties}>
          <span className="dm-num">{n}</span><h3>{title}</h3><p>{text}</p><em>{when}</em>
        </article>)}
      </div>
    </div> : <div className="dm-offer" key="offer">
      <div className="dm-spin" />
      <div className="dm-offer-left">
        <span className="dm-tag solid">(05) A oferta</span>
        <h2>Um time de SDR inteiro, pronto em 7 dias.</h2>
        <p>SDR com IA, CRM completo e implantação guiada em um único plano. Sem fidelidade e com teste de 7 dias para você ver o resultado antes de decidir.</p>
        <span className="dm-final-btn red">Teste de 7 dias para a {company} <DIcon name="arrow" size={20} /></span>
        <small>Sem cartão para começar. Cancele quando quiser.</small>
      </div>
      <ul className="dm-offer-list">
        {offer.map(([title, detail], index) => <li key={title} style={{ '--i': index } as CSSProperties}><span className="dm-ck"><DIcon name="check" size={16} /></span><div><b>{title}</b><small>{detail}</small></div></li>)}
      </ul>
    </div>}
  </section>;
}

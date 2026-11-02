import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { startFx, type Fx } from './fx';
import './landing.css';

const APP = '/app';

type IconName = 'zap' | 'arrow' | 'play' | 'user-check' | 'calendar-check' | 'message' | 'instagram' | 'mail' | 'calendar' | 'megaphone' | 'webhook' | 'target' | 'repeat' | 'quote' | 'check' | 'plus';
const paths: Record<IconName, ReactNode> = {
  zap: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  arrow: <path d="M7 17 17 7M8 7h9v9" />,
  play: <path d="M6 4v16l14-8z" />,
  'user-check': <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m16 11 2 2 4-4" /></>,
  'calendar-check': <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18m-11 6 2 2 4-4" /></>,
  message: <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l1.9-5.6A8.4 8.4 0 1 1 21 11.5z" />,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  megaphone: <path d="m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6" />,
  webhook: <><circle cx="12" cy="6" r="3" /><circle cx="5" cy="18" r="3" /><circle cx="19" cy="18" r="3" /><path d="m10.5 8.5-4 6M13.5 8.5l4 6M8 18h8" /></>,
  target: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
  repeat: <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3" />,
  quote: <path d="M3 21c3 0 7-1 7-8V5H3v8h4M14 21c3 0 7-1 7-8V5h-7v8h4" />,
  check: <path d="m5 12 5 5 9-10" />,
  plus: <path d="M12 5v14M5 12h14" />,
};
function Icon({ name, size = 20, fill = false }: { name: IconName; size?: number; fill?: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

/** Texto dividido em palavras com máscara (sobe linha a linha). */
function Split({ text, base = 0, step = 70 }: { text: string; base?: number; step?: number }) {
  return <>{text.split(' ').map((w, i) => <span className="sw" key={i}><span className="swi" style={{ transitionDelay: `${base + i * step}ms` }}>{w}</span></span>)}</>;
}
function FillText({ text }: { text: string }) {
  return <span data-fill>{text.split(' ').map((w, i) => <span className="fw" key={i}>{w} </span>)}</span>;
}
function Reveal({ children, delay = 0, className = '', as: Tag = 'div', ...rest }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'li' | 'p' | 'h2' | 'span' } & Record<string, unknown>) {
  return <Tag className={`rv ${className}`} data-reveal style={{ '--d': `${delay}ms` } as CSSProperties} {...rest}>{children}</Tag>;
}
function Cta({ children, className = '', label = 'Entrar' }: { children: ReactNode; className?: string; label?: string }) {
  return <a href={APP} className={`btn ${className}`} data-magnetic="0.3" data-cursor-label={label}><span className="btn-in"><span className="btn-t">{children}</span><span className="btn-t btn-t2" aria-hidden="true">{children}</span></span><Icon name="arrow" size={18} /></a>;
}

const marqueeItems: { icon: IconName; name: string }[] = [
  { icon: 'message', name: 'WhatsApp' }, { icon: 'instagram', name: 'Instagram' }, { icon: 'mail', name: 'Gmail' },
  { icon: 'calendar', name: 'Google Agenda' }, { icon: 'megaphone', name: 'Meta Ads' }, { icon: 'webhook', name: 'API & Webhooks' },
];
const steps = [
  { n: '01', t: 'Diagnóstico', d: 'Mapeamos seu produto, seu cliente ideal, as objeções mais comuns e o que define um lead qualificado.', when: 'Dia 1' },
  { n: '02', t: 'Treino da IA', d: 'Ensinamos o SDR com seu tom de voz, FAQs, materiais e regras de qualificação.', when: 'Dias 2 a 4' },
  { n: '03', t: 'Conexão dos canais', d: 'WhatsApp, Instagram, e-mail e agenda conectados ao CRM em poucos cliques.', when: 'Dia 5' },
  { n: '04', t: 'Go-live e otimização', d: 'A IA entra no ar e melhora toda semana com base nas conversas reais.', when: 'Dia 7' },
];
const faqs = [
  ['A IA vai parecer um robô para os meus clientes?', 'Não. Ela aprende seu tom de voz, seus materiais e suas objeções, e conversa de forma natural. Quando a conversa pede um humano, ela passa o bastão com todo o contexto.'],
  ['Em quanto tempo consigo começar?', 'Em até 7 dias: diagnóstico no dia 1, treino da IA entre os dias 2 e 4, conexão dos canais no dia 5 e go-live no dia 7.'],
  ['Preciso trocar meu número de WhatsApp?', 'Não. Você conecta o número que já usa hoje e continua atendendo por ele; a IA responde no mesmo canal e o time assume quando quiser.'],
  ['O que acontece quando a IA não sabe responder?', 'Ela não inventa. A conversa é encaminhada a um vendedor com o histórico completo, e a dúvida vira material para treinar a IA nas próximas semanas.'],
  ['Meus dados estão seguros?', 'Cada conta tem os dados isolados e protegidos por controle de acesso, e o tratamento segue a LGPD. Suas conversas não são compartilhadas entre clientes.'],
  ['Já uso outro CRM. Preciso migrar?', 'Não necessariamente. Você pode usar o CRM da plataforma ou integrar o seu por API e webhooks, mantendo o processo que já funciona.'],
];
const compare: [string, string, string][] = [
  ['Primeira resposta', 'Minutos ou horas', '8 segundos'], ['Disponibilidade', 'Horário comercial', '24 horas, 7 dias'],
  ['Custo mensal', 'Salário, comissão e encargos', 'Uma fração do custo'], ['Escala', 'Contratar e treinar', 'Ilimitada, na hora'],
  ['Follow-up', 'Depende da disciplina', '100% automático'], ['Dados', 'Planilhas espalhadas', 'CRM atualizado sozinho'],
];

function Preloader({ done }: { done: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t0 = performance.now(); let raf = 0;
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / 1300); setN(Math.round((1 - Math.pow(1 - p, 3)) * 100)); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className={`pre ${done ? 'out' : ''}`} aria-hidden="true"><img src="/brand/logo-light.svg" alt="" /><b>{n}</b><i style={{ transform: `scaleX(${n / 100})` }} /></div>;
}

/** Conversa de exemplo que digita em loop quando visível. */
function ChatDemo() {
  const msgs: [boolean, string][] = [
    [false, 'Oi! Vi o anúncio de vocês. Atendem clínicas?'], [true, 'Atendemos sim! Quantos atendimentos vocês fazem por mês?'],
    [false, 'Uns 400, mais ou menos.'], [true, 'Perfeito. Tenho horário amanhã às 14:30 com nosso consultor. Confirmo para você?'],
  ];
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  useEffect(() => { const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 }); if (ref.current) io.observe(ref.current); return () => io.disconnect(); }, []);
  useEffect(() => {
    if (!visible) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setStep(msgs.length); return; }
    const t = setTimeout(() => setStep((s) => (s >= msgs.length ? 0 : s + 1)), step >= msgs.length ? 3800 : step === 0 ? 500 : 1500);
    return () => clearTimeout(t);
  }, [visible, step]); // eslint-disable-line react-hooks/exhaustive-deps
  const typing = step < msgs.length && step > 0 && msgs[step][0];
  return <div className="chat" ref={ref}>
    {msgs.slice(0, step).map(([ia, text], i) => <div key={i} className={`bub ${ia ? 'ia' : 'usr'}`}>{text}</div>)}
    {typing && <div className="bub ia typing"><i /><i /><i /></div>}
  </div>;
}

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);
  const fx = useRef<Fx | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(0);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setReady(true), reduce ? 0 : 1650);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!rootRef.current) return;
    fx.current = startFx(rootRef.current);
    return () => fx.current?.destroy();
  }, []);
  useEffect(() => { fx.current?.lock(!ready); document.documentElement.style.overflow = ready ? '' : 'hidden'; return () => { document.documentElement.style.overflow = ''; }; }, [ready]);
  useEffect(() => { document.title = 'V4 Oliveira & Co · SDR com IA + CRM'; }, []);

  const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); setMenu(false); fx.current?.scrollTo(id); };

  return <div className={`lp ${ready ? 'ready' : ''}`} ref={rootRef}>
    <Preloader done={ready} />
    <div className="progress" data-progress />
    <div className="cursor" data-cursor aria-hidden="true"><span /></div>
    <div className="grain" aria-hidden="true" />

    <header className="nav" data-nav>
      <a href="/" className="nav-logo" aria-label="V4 Oliveira & Co"><img src="/brand/logo-dark.svg" alt="V4 Oliveira & Co" /></a>
      <nav className={menu ? 'open' : ''} aria-label="Principal">
        {[['#solucao', 'Solução'], ['#como-funciona', 'Como funciona'], ['#resultados', 'Resultados'], ['#faq', 'FAQ']].map(([h, l]) => <a key={h} href={h} onClick={go(h)} className="nl"><span>{l}</span></a>)}
        <a href="/precos" className="nl"><span>Planos e preços</span></a>
      </nav>
      <a href={APP} className="nav-cta" data-magnetic="0.25">Agendar demonstração</a>
      <button className="burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><i /><i /></button>
    </header>

    {/* HERO */}
    <section className="hero">
      <div className="orb o1" /><div className="orb o2" /><div className="glow" />
      <div className="hero-top">
        <div className="hero-left">
          <Reveal className="badge"><i /> SDR com IA + CRM completo para vendas</Reveal>
          <h1 className={ready ? 'in' : ''}>
            <span className="hl"><Split text="Seu SDR de IA" base={150} step={90} /></span>
            <span className="hl"><Split text="que nunca perde" base={400} step={90} /></span>
            <span className="hl red"><Split text="um lead." base={700} step={90} /></span>
          </h1>
        </div>
        <div className="hero-right">
          <Reveal delay={900} as="p" className="sub">Atende no WhatsApp, Instagram e e-mail em segundos, qualifica cada contato e agenda a reunião direto na agenda do seu time. Tudo dentro de um CRM feito para vender.</Reveal>
          <Reveal delay={1050} className="btns">
            <Cta className="primary" label="Ver">Quero ver em ação</Cta>
            <a href="#como-funciona" onClick={go('#como-funciona')} className="btn ghost" data-magnetic="0.3"><Icon name="play" size={14} fill /> <span>Como funciona</span></a>
          </Reveal>
          <Reveal delay={1200} className="proof">
            <div className="avs">{[1, 2, 3, 4].map((i) => <i key={i} style={{ backgroundImage: `url(/lp/avatar${i}.jpg)`, zIndex: 5 - i }} />)}</div>
            <span>+300 times comerciais vendem mais com a SDR AI</span>
          </Reveal>
        </div>
      </div>

      <div className="stage-wrap" data-stage>
        <div className="stage" data-tilt>
          <div className="stage-glow" />
          <div className="shot" style={{ backgroundImage: 'url(/lp/product.jpg)' }} role="img" aria-label="Tela da plataforma SDR AI com agenda de reuniões" />
          <div className="chip c1" data-parallax="-0.06"><span className="ic green"><Icon name="user-check" size={18} /></span><div><b>Lead qualificado</b><small>Score 92 · pronto para reunião</small></div></div>
          <div className="chip c2" data-parallax="0.05"><span className="ic red"><Icon name="calendar-check" size={18} /></span><div><b>Reunião agendada</b><small>Hoje às 14:30 com Marina</small></div></div>
          <div className="chip c3" data-parallax="-0.09"><span className="ic ink"><Icon name="zap" size={18} /></span><div><b>Resposta em 8s</b><small>Via WhatsApp, às 02:14 da manhã</small></div></div>
        </div>
      </div>
    </section>

    {/* INTEGRAÇÕES */}
    <section className="band" aria-label="Integrações">
      <p>Conectado ao que você já usa</p>
      <div className="marq" data-marquee>
        <div className="marq-in">{[...marqueeItems, ...marqueeItems, ...marqueeItems, ...marqueeItems].map((m, i) => <span key={i} className="mi"><Icon name={m.icon} size={26} />{m.name}</span>)}</div>
      </div>
    </section>

    {/* PROBLEMA */}
    <section className="sec problem" id="problema">
      <div className="head"><Reveal className="label">(01) O problema</Reveal>
        <div>
          <h2 className="big"><FillText text="Todo lead que espera mais de 5 minutos já esfriou." /></h2>
          <Reveal as="p" className="lead" delay={100}>Seu time passa o dia respondendo as mesmas perguntas, esquecendo follow-ups e perdendo venda para quem respondeu primeiro. A SDR AI assume essa fila inteira e entrega ao vendedor só oportunidades qualificadas, com reunião já marcada.</Reveal>
        </div>
      </div>
      <div className="stats" id="resultados">
        {([['8', 's', 'Primeira resposta', 'tempo médio, em qualquer canal', ''], ['24', '/7', 'Atendimento contínuo', 'sem folga, feriado ou fila de espera', ''], ['3', 'x', 'Mais reuniões', 'agendadas com leads realmente qualificados', ''], ['70', '%', 'Custo por lead qualificado', 'comparado a uma equipe de SDRs', '-']] as const).map(([v, s, l, d, p], i) => (
          <Reveal key={l} delay={i * 110} className="stat" data-spot>
            <div className="val"><span data-count={v} data-prefix={p} data-suffix={s}>{p}0{s}</span></div>
            <b>{l}</b><small>{d}</small>
          </Reveal>))}
      </div>
    </section>

    {/* SOLUÇÃO */}
    <section className="sec dk solution" id="solucao">
      <div className="dglow" />
      <div className="head"><Reveal className="label">(02) A solução</Reveal>
        <div>
          <h2 className="big white"><Reveal as="span" className="spl">Um SDR. Um CRM. Zero lead esquecido.</Reveal></h2>
          <Reveal as="p" className="lead" delay={120}>Esqueça planilhas e ferramentas soltas. A SDR AI conversa, qualifica e agenda, e o CRM guarda tudo no lugar certo, sem ninguém digitar.</Reveal>
        </div>
      </div>
      <div className="bento1">
        <Reveal className="card chatcard" data-spot data-tilt-soft>
          <span className="tag">01 · SDR com IA</span>
          <h3>Conversa como gente, responde em segundos.</h3>
          <p>Entende contexto, tira dúvidas e conduz a conversa até a reunião. Em WhatsApp, Instagram e e-mail.</p>
          <ChatDemo />
        </Reveal>
        <Reveal className="card crmcard" delay={140} data-spot>
          <span className="tag">02 · CRM completo</span>
          <h3>Cada conversa vira um negócio organizado.</h3>
          <p>Ficha do cliente, histórico, score e próximos passos atualizados automaticamente a cada mensagem.</p>
          <div className="crmshot"><div style={{ backgroundImage: 'url(/lp/crm.jpg)' }} data-parallax="0.05" role="img" aria-label="Ficha de contato no CRM" /></div>
        </Reveal>
      </div>
      <div className="bento2">
        <Reveal className="card" data-spot>
          <span className="ico"><Icon name="target" /></span><h3>Qualificação automática</h3><p>Perguntas certas, score por lead e só os quentes chegam ao time.</p>
          <div className="bars">{[['Orçamento', 85], ['Urgência', 70], ['Decisor', 95]].map(([n, v], i) => <div key={n}><div className="bh"><span>{n}</span><em>{v}%</em></div><div className="trk"><i style={{ '--w': `${v}%`, '--bd': `${400 + i * 180}ms` } as CSSProperties} /></div></div>)}</div>
        </Reveal>
        <Reveal className="card" delay={120} data-spot>
          <span className="ico"><Icon name="calendar-check" /></span><h3>Agenda a reunião sozinho</h3><p>Cruza a agenda do time, propõe horários e confirma com o lead.</p>
          <div className="meet"><div className="date"><small>QUI</small><b>14</b></div><div><b>Demo com Marina · 14:30</b><small><i /> Confirmado pelo WhatsApp</small></div></div>
        </Reveal>
        <Reveal className="card" delay={240} data-spot>
          <span className="ico"><Icon name="repeat" /></span><h3>Follow-up que não esquece</h3><p>Retoma quem sumiu no momento certo, com a mensagem certa.</p>
          <div className="tl" data-line>{[['Dia 1', 'Mensagem no WhatsApp'], ['Dia 3', 'Áudio personalizado'], ['Dia 5', 'E-mail com proposta']].map(([d, a], i) => <div key={d} style={{ '--i': i } as CSSProperties}><i /><b>{d}</b><span>{a}</span></div>)}</div>
        </Reveal>
      </div>
    </section>

    {/* COMO FUNCIONA — scroll horizontal fixado */}
    <section className="how" id="como-funciona" data-hscroll>
      <div className="how-pin">
        <div className="head"><Reveal className="label">(03) Como funciona</Reveal><h2 className="big"><Reveal as="span" className="spl">No ar em 7 dias, sem dor de cabeça.</Reveal></h2></div>
        <div className="hbar"><i /></div>
        <div className="track" data-track>
          {steps.map((s, i) => <article key={s.n} className="step" data-spot style={{ '--i': i } as CSSProperties}>
            <span className="num">{s.n}</span><h3>{s.t}</h3><p>{s.d}</p><em>{s.when}</em>
          </article>)}
        </div>
      </div>
    </section>

    {/* DEPOIMENTO */}
    <section className="sec testi">
      <Reveal className="tcard" data-spot>
        <div className="portrait"><div style={{ backgroundImage: 'url(/lp/portrait.jpg)' }} data-parallax="0.07" role="img" aria-label="Marina Duarte" /></div>
        <div className="tq">
          <Icon name="quote" size={44} />
          <blockquote><FillText text="Em 30 dias, todo lead passou a ser respondido em segundos. Nossos vendedores só entram para fechar e a agenda nunca esteve tão cheia." /></blockquote>
          <div className="auth"><div><b>Marina Duarte</b><small>Diretora Comercial, Clínica Aura</small></div>
            <div className="res"><strong><span data-count="42" data-prefix="+" data-suffix="%">+0%</span></strong><small>reuniões agendadas em 30 dias</small></div></div>
        </div>
      </Reveal>
    </section>

    {/* COMPARATIVO */}
    <section className="sec compare">
      <div className="head"><Reveal className="label">(04) Comparativo</Reveal><h2 className="big"><Reveal as="span" className="spl">SDR humano ou SDR de IA?</Reveal></h2></div>
      <div className="table" role="table">
        <div className="tr th" role="row"><span /><span>SDR tradicional</span><span className="ai">SDR AI &amp; CRM</span></div>
        {compare.map(([c, a, b], i) => <Reveal key={c} delay={i * 70} className="tr" role="row"><span>{c}</span><span>{a}</span><span className="ai"><Icon name="check" size={16} /> {b}</span></Reveal>)}
      </div>
    </section>

    {/* OFERTA */}
    <section className="sec offer" id="oferta">
      <Reveal className="ocard">
        <div className="spin" />
        <div className="oleft">
          <span className="tag">(05) A oferta</span>
          <h2>Um plano para cada operação comercial.</h2>
          <p>Do CRM ao SDR IA: planos propostos a partir de R$ 199/mês, com franquias claras de leads, funcionalidades e automação. O SDR IA de R$ 449/mês é o ponto de partida para qualificar e agendar.</p>
          <a href="/precos" className="btn primary">Comparar planos e preços <Icon name="arrow" size={18} /></a>
          <small>Preços sujeitos à validação comercial. Implantação e tarifas da Meta à parte.</small>
        </div>
        <ul className="olist">
          {[['SDR com IA treinado no seu negócio', 'Tom de voz, FAQs e regras de qualificação'], ['WhatsApp, Instagram e e-mail', 'Todos os canais em uma só caixa de entrada'], ['CRM completo', 'Funis, contatos, ficha do cliente e score'], ['Agendamento automático', 'Integrado ao Google Agenda do seu time'], ['Follow-ups e API aberta', 'Cadências automáticas, API e webhooks'], ['Implantação guiada e suporte humano', 'Do primeiro dia ao go-live']].map(([t, d], i) =>
            <Reveal as="li" key={t} delay={200 + i * 100}><span className="ck"><Icon name="check" size={16} /></span><div><b>{t}</b><small>{d}</small></div></Reveal>)}
        </ul>
      </Reveal>
    </section>

    {/* FAQ */}
    <section className="sec faq" id="faq">
      <div className="head"><Reveal className="label">(06) FAQ</Reveal><h2 className="big"><Reveal as="span" className="spl">Perguntas frequentes</Reveal></h2></div>
      <div className="qs">
        {faqs.map(([q, a], i) => <Reveal key={q} delay={i * 60} className="qw">
          <div className={`q ${open === i ? 'open' : ''}`}>
            <button aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? -1 : i)}><span>{q}</span><i className="pm"><Icon name="plus" size={20} /></i></button>
            <div className="ans" id={`faq-${i}`} role="region"><div><p>{a}</p></div></div>
          </div>
        </Reveal>)}
      </div>
    </section>

    {/* CTA FINAL */}
    <section className="final">
      <div className="fm" data-marquee="rev" aria-hidden="true"><div>{Array.from({ length: 8 }).map((_, i) => <span key={i}>Seu próximo cliente já está chamando&nbsp;<em>✦</em>&nbsp;</span>)}</div></div>
      <h2 className="fh" data-reveal><span className="sw"><span className="swi">Seu próximo</span></span><span className="sw"><span className="swi">cliente já está</span></span><span className="sw"><span className="swi">chamando.</span></span></h2>
      <div className="frow">
        <Reveal as="p">Agende uma demonstração de 20 minutos e veja a SDR AI atendendo, qualificando e agendando em tempo real.</Reveal>
        <a href={APP} className="btn ink big" data-magnetic="0.35" data-cursor-label="Entrar"><span className="btn-in"><span className="btn-t">Agendar demonstração</span><span className="btn-t btn-t2" aria-hidden="true">Agendar demonstração</span></span><Icon name="arrow" size={20} /></a>
      </div>
    </section>

    <footer className="foot">
      <img src="/brand/logo-light.svg" alt="V4 Oliveira & Co" />
      <nav>{[['#solucao', 'Solução'], ['#como-funciona', 'Como funciona'], ['#faq', 'FAQ']].map(([h, l]) => <a key={h} href={h} onClick={go(h)}>{l}</a>)}<a href="/precos">Planos e preços</a><a href={APP}>Entrar na plataforma</a></nav>
      <small>© {new Date().getFullYear()} V4 Oliveira &amp; Co. Todos os direitos reservados.</small>
    </footer>
  </div>;
}

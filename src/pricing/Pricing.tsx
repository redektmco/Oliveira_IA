import {useEffect,useState} from 'react';
import {Icon,type IconName} from '../components/ui';
import {brl,number,commercialPlans,estimatePlan,expansion,type CommercialPlanId} from './plans';
import '../index.css';
import '../styles/brand.css';
import './pricing.css';

const comparisons = [
 ['Usuários','3','5','10','Sob medida'],
 ['Números WhatsApp','1','1','2','Sob medida'],
 ['Leads atendidos por mês','Sem atendimento autônomo','500','1.500','Sob medida'],
 ['Interações de IA por mês','300 sugestões/resumos','2.000','6.000','Sob medida'],
 ['CRM Kanban e caixa compartilhada','Incluído','Incluído','Incluído','Sob medida'],
 ['Qualificação, agendamento e follow-up','—','Incluído','Incluído','Sob medida'],
 ['Transferência para humano','—','Incluído','Incluído','Sob medida'],
 ['Automações avançadas e múltiplos funis','—','—','Incluído','Sob medida'],
 ['API/webhook e relatórios avançados','—','—','Incluído','Sob medida'],
 ['Implantação inicial',brl(390),brl(790),brl(1490),'Sob consulta'],
];
const faqs = [
 ['O que conta como um lead atendido?','Um lead atendido é um contato único que conversou com a IA naquele mês. Se o mesmo contato voltar a conversar no mesmo mês, ele continua contando como um único lead.'],
 ['O que conta como uma interação de IA?','Cada resposta gerada pela IA conta como uma interação. No Essencial, a franquia é de 300 sugestões ou resumos com IA, sem atendimento autônomo.'],
 ['As tarifas de WhatsApp estão incluídas?','Não. As tarifas de mensagens da Meta ficam separadas da assinatura. A proposta é que sejam faturadas preferencialmente direto na conta Meta de cada cliente. Disparos comerciais também ficam fora da mensalidade.'],
 ['Como funciona a implantação?','A implantação inicial proposta é de R$ 390 no Essencial, R$ 790 no SDR IA e R$ 1.490 no Performance. No Enterprise, é definida na proposta. Integrações personalizadas são orçadas à parte.'],
 ['Posso expandir minha franquia?','Para SDR IA e Performance, o pacote adicional sugerido inclui 500 leads e 2.000 interações por R$ 149/mês. A proposta prevê limites financeiros e técnicos por empresa e alertas antes do esgotamento. As condições finais serão validadas comercialmente.'],
 ['A assessoria comercial da V4 faz parte da assinatura?','Não. A assinatura é da plataforma. Configuração contínua de fluxos, revisão de conversas, otimização de prompts e acompanhamento de conversões são serviços adicionais, contratados separadamente.'],
 ['Esses valores já são condições de contratação?','São preços mensais propostos, sujeitos à validação comercial. Esta página permite comparar e simular os planos; não ativa uma assinatura nem realiza cobranças. Os recursos e limites devem ser confirmados na proposta comercial.'],
];
export default function Pricing(){
 const [selected,setSelected]=useState<CommercialPlanId>('sdr');
 const [packages,setPackages]=useState(0);
 const [status,setStatus]=useState('');
 const estimate=estimatePlan(selected,packages);
 const expandable=selected==='sdr'||selected==='performance';
 useEffect(()=>{document.title='Planos e preços · SDR IA | V4 Oliveira & Co';const meta=document.querySelector('meta[name="description"]');const previous=meta?.getAttribute('content');meta?.setAttribute('content','Conheça os planos propostos de SDR IA e CRM da V4: Essencial, SDR IA, Performance e Enterprise. Compare leads, automações e implantação.');return()=>{if(previous)meta?.setAttribute('content',previous);};},[]);
 function selectPlan(id:CommercialPlanId){setSelected(id);setPackages(0);setStatus('');document.getElementById('simular')?.scrollIntoView({block:'start'});document.getElementById('simulation-plan')?.focus({preventScroll:true});}
 async function copyEstimate(){
  const text=[`V4 Oliveira & Co — ${estimate.plan.name}`,`Mensalidade: ${estimate.monthly===null?'sob consulta':brl(estimate.monthly)+'/mês'}`,`Implantação: ${estimate.setup===null?'sob consulta':brl(estimate.setup)+' (pagamento inicial)'}`,estimate.leads!==null?`${number(estimate.leads)} leads/mês · ${number(estimate.interactions!)} interações de IA/mês`:estimate.plan.id==='essencial'?'300 sugestões/resumos de IA · sem atendimento autônomo':'Referência inicial: R$ 1.490/mês; escopo e valores sob consulta.',estimate.packages?`${estimate.packages} pacote(s) adicional(is) de 500 leads + 2.000 interações`:'', 'Tarifas da Meta, integrações personalizadas e assessoria comercial à parte.','Preços propostos, sujeitos à validação comercial. Esta simulação não constitui contratação.'].filter(Boolean).join('\n');
  try{await navigator.clipboard.writeText(text);setStatus('Simulação copiada.');}catch{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='v4-simulacao-do-plano.txt';link.click();URL.revokeObjectURL(url);setStatus('Simulação baixada em arquivo de texto.');}
 }
 return <div className="v4p">
  <a className="v4p-skip" href="#v4p-main">Pular para o conteúdo</a>
  <header className="v4p-nav"><a href="/" aria-label="V4 Oliveira & Co, início"><img src="/brand/logo-dark.svg" alt="V4 Oliveira & Co"/></a><nav aria-label="Navegação principal"><a href="/">Solução</a><a href="/precos" aria-current="page">Planos e preços</a><a href="/demo">Demonstração <Icon name="arrow" size={15}/></a></nav><a className="v4p-login" href="/app">Entrar <Icon name="arrow" size={16}/></a></header>
  <main id="v4p-main">
   <section className="v4p-hero v4p-wrap"><span className="v4p-eyebrow"><i/> SDR IA + CRM · V4 OLIVEIRA & CO</span><h1>Mais conversas qualificadas.<br/><em>Um plano para cada operação.</em></h1><p>Atendimento, qualificação e CRM conectados à sua operação comercial.<br/>Escolha pelo volume de leads e pelo nível de automação que você precisa.</p><div className="v4p-hero-notes"><span><Icon name="check" size={15}/>Mensalidades em reais</span><span><Icon name="check" size={15}/>Franquias claras</span><span><Icon name="check" size={15}/>Expansão conforme a demanda</span></div><small>Preços propostos · sujeitos à validação comercial</small></section>
   <section className="v4p-plans v4p-wrap" aria-label="Planos e preços mensais">{commercialPlans.map(plan=><article key={plan.id} className={`v4p-plan ${plan.id==='sdr'?'v4p-featured':''}`} aria-labelledby={`plan-${plan.id}`}>
    {plan.id==='sdr'&&<div className="v4p-popular"><Icon name="spark" size={15}/> Mais vendido</div>}
    <div className="v4p-plan-icon"><Icon name={plan.icon as IconName} size={24}/></div><h2 id={`plan-${plan.id}`}>{plan.name}</h2><p className="v4p-plan-description">{plan.description}</p>
    <div className={`v4p-price ${plan.price===null?'v4p-custom-price':''}`}>{plan.price===null?<strong>Sob consulta</strong>:<><span>R$</span><strong>{plan.price}</strong><small>/mês</small></>}</div>
    <p className="v4p-setup">{plan.setup===null?'Referência inicial: R$ 1.490/mês':`+ ${brl(plan.setup)} de implantação inicial`}</p>
    <button type="button" className={`v4p-button ${plan.id==='sdr'?'v4p-red':''}`} onClick={()=>selectPlan(plan.id)}>{plan.price===null?'Ver condições':'Simular '+plan.name}<Icon name="arrow" size={17}/></button>
    <ul className="v4p-features"><li><Icon name="users" size={16}/>{plan.users}</li><li><Icon name="whatsapp" size={16}/>{plan.whatsapp}</li>{plan.leads!==null&&<><li className="v4p-key-feature"><Icon name="message" size={16}/>{number(plan.leads)} leads atendidos/mês</li><li className="v4p-key-feature"><Icon name="spark" size={16}/>{number(plan.interactions!)} interações de IA</li></>}{plan.features.map(feature=><li key={feature}><Icon name="check" size={15}/>{feature}</li>)}</ul>
    {plan.limit&&<p className="v4p-limit"><Icon name="info" size={15}/>{plan.limit}</p>}
   </article>)}</section>
   <div className="v4p-meta-note v4p-wrap"><Icon name="info" size={17}/><p>Tarifas de mensagens da Meta cobradas à parte, preferencialmente na conta Meta de cada cliente.</p></div>
   <section className="v4p-section v4p-wrap" id="comparar"><div className="v4p-section-heading"><div><span className="v4p-eyebrow">O QUE MUDA EM CADA PLANO</span><h2>Da organização do comercial<br/>à operação automatizada.</h2></div><p>Compare recursos, capacidade<br/>e investimento inicial.</p></div><p className="v4p-scroll-note">Deslize a tabela para comparar todos os planos →</p><div className="v4p-table-scroll" tabIndex={0} role="region" aria-label="Comparação dos planos"><table><caption className="v4p-sr-only">Comparação dos recursos e franquias mensais</caption><thead><tr><th scope="col">Recursos e franquias</th>{commercialPlans.map(plan=><th scope="col" key={plan.id}>{plan.name}</th>)}</tr></thead><tbody>{comparisons.map(([label,...values])=><tr key={label}><th scope="row">{label}</th>{values.map((value,i)=><td key={i}>{value==='—'?<span aria-label="Não incluído">—</span>:value==='Incluído'?<><Icon name="check" size={17}/><span className="v4p-sr-only">Incluído</span></>:value}</td>)}</tr>)}</tbody></table></div></section>
   <section className="v4p-expansion v4p-wrap"><div className="v4p-expansion-icon"><Icon name="plus" size={25}/></div><div><span className="v4p-eyebrow">MAIS DEMANDA? MAIS CAPACIDADE.</span><h2>500 leads + 2.000 interações de IA</h2><p>Pacote adicional sugerido para SDR IA e Performance.<br/>Limites por empresa e alertas previstos antes do esgotamento da franquia.</p></div><p className="v4p-expansion-price"><strong>R$ 149</strong><span>/mês por pacote</span></p></section>
   <section className="v4p-section v4p-simulator v4p-wrap" id="simular" aria-labelledby="simulation-title"><div><span className="v4p-eyebrow">PLANEJE O PRÓXIMO PASSO</span><h2 id="simulation-title">Encontre espaço<br/>para sua demanda.</h2><p>Simule a assinatura e veja a implantação separadamente. A cobrança da plataforma acompanha seu plano e sua franquia comercial.</p><div className="v4p-service-note"><Icon name="building" size={21}/><p><strong>Plataforma e assessoria são produtos diferentes.</strong>Configuração contínua de fluxos, revisão de conversas, otimização de prompts e acompanhamento de conversões são serviços adicionais.</p></div></div>
    <div className="v4p-simulation-card"><label htmlFor="simulation-plan">Seu plano</label><select id="simulation-plan" value={selected} onChange={event=>{setSelected(event.target.value as CommercialPlanId);setPackages(0);setStatus('');}}>{commercialPlans.map(plan=><option key={plan.id} value={plan.id}>{plan.name}{plan.price!==null?` — ${brl(plan.price)}/mês`:' — sob consulta'}</option>)}</select>
     {expandable&&<><label htmlFor="simulation-packages">Pacotes adicionais de capacidade</label><select id="simulation-packages" value={packages} onChange={event=>{setPackages(Number(event.target.value));setStatus('');}}>{Array.from({length:11},(_,i)=><option key={i} value={i}>{i===0?'Sem pacote adicional':`${i} ${i===1?'pacote':'pacotes'} · + ${brl(i*expansion.price)}/mês`}</option>)}</select><p className="v4p-capacity" aria-live="polite">{number(estimate.leads!)} leads/mês <span>·</span> {number(estimate.interactions!)} interações de IA/mês</p></>}
     <div className="v4p-estimate" aria-live="polite"><div><span>Assinatura mensal</span><strong data-testid="monthly-total">{estimate.monthly===null?'Sob consulta':brl(estimate.monthly)}</strong></div><div><span>Implantação inicial</span><strong>{estimate.setup===null?'Sob consulta':brl(estimate.setup)}</strong></div>{estimate.monthly!==null&&estimate.setup!==null&&<div className="v4p-first-month"><span>Primeiro mês + implantação</span><strong data-testid="first-month-total">{brl(estimate.monthly+estimate.setup)}</strong></div>}</div>
     {selected==='enterprise'&&<p className="v4p-capacity">Referência inicial de R$ 1.490/mês. Volume, unidades, integrações e implantação definidos na proposta.</p>}{selected==='essencial'&&<p className="v4p-capacity">300 sugestões/resumos com IA. Sem atendimento autônomo.</p>}
     <p className="v4p-estimate-note">Tarifas da Meta, integrações personalizadas e assessoria à parte. Valores sujeitos à validação comercial.</p><button type="button" className="v4p-button v4p-red" onClick={()=>void copyEstimate()}>Copiar simulação<Icon name="download" size={17}/></button><p className="v4p-copy-status" role="status">{status}</p>
    </div>
   </section>
   <section className="v4p-section v4p-faq v4p-wrap" id="duvidas"><div><span className="v4p-eyebrow">SEM LETRAS MIÚDAS</span><h2>As regras claras.<br/>Desde a primeira conversa.</h2><p>Entenda a franquia, a implantação<br/>e os serviços que ficam à parte.</p></div><div>{faqs.map(([question,answer],i)=><details key={question} open={i===0?true:undefined}><summary>{question}<Icon name="plus" size={18}/></summary><p>{answer}</p></details>)}</div></section>
   <section className="v4p-closing v4p-wrap"><div><span className="v4p-eyebrow">CONHEÇA A OPERAÇÃO NA PRÁTICA</span><h2>Seu próximo SDR<br/>começa aqui.</h2><p>Veja como atendimento, qualificação e CRM se conectam.</p></div><a className="v4p-button" href="/demo">Explorar demonstração<Icon name="arrow" size={20}/></a></section>
  </main><footer className="v4p-footer v4p-wrap"><a href="/" aria-label="V4 Oliveira & Co, início"><img src="/brand/logo-dark.svg" alt="V4 Oliveira & Co"/></a><nav aria-label="Rodapé"><a href="/">Conheça a solução</a><a href="/app#settings/billing">Já sou cliente</a><a href="#duvidas">Dúvidas</a></nav><small>SDR IA + CRM · V4 Oliveira & Co<br/>Condições comerciais propostas, sujeitas à validação.</small></footer>
 </div>;
}

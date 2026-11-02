import {useEffect} from 'react';
import {Icon} from '../components/ui';
import {useCookieConsent} from '../marketing/CookieConsent';
import {legalDocuments,LegalContact} from './content';
import './legal.css';

export default function LegalPage(){
 const slug=window.location.pathname.replace(/^\//,'').replace(/\/$/,'');
 const document=legalDocuments.find(item=>item.slug===slug);
 const {openPreferences}=useCookieConsent();
 useEffect(()=>{window.document.title=`${document?.title||'Central de transparência'} · V4 Oliveira & Co`;},[document]);
 return <main className="legal-page" id="legal-main">
  <div className="legal-hero"><span className="mk-kicker">V4 OLIVEIRA & CO · TRANSPARÊNCIA</span>{document&&<a className="legal-back" href="/legal">← Todas as políticas</a>}<h1>{document?.title||<>Uma relação clara.<br/><em>Do acesso aos seus direitos.</em></>}</h1><p>{document?.description||'Conheça as regras da plataforma, como tratamos dados e como você pode controlar suas preferências.'}</p>{document&&<div className="legal-meta">Versão 1.0 <span>·</span> Atualizado em 1º de novembro de 2026</div>}</div>
  {!document?<><section className="legal-cards" aria-label="Políticas disponíveis">{legalDocuments.map(item=><a href={`/${item.slug}`} key={item.slug} className="legal-card"><Icon name={item.icon} size={26}/><h2>{item.label}</h2><p>{item.description}</p><span>Ler política<Icon name="arrow" size={18}/></span></a>)}<button className="legal-card legal-card-cookie" onClick={openPreferences}><Icon name="settings" size={26}/><h2>Suas preferências</h2><p>Aceite, recuse ou revise o armazenamento opcional. A escolha continua nas suas mãos.</p><span>Gerenciar cookies<Icon name="arrow" size={18}/></span></button></section><section className="legal-overview"><h2>Precisa fazer uma solicitação?</h2><p>Nas páginas de LGPD e reembolso você encontra o que informar e como encaminhar seu pedido. Os dados de contratação identificam a empresa responsável pela sua relação comercial.</p><LegalContact/></section></>:<div className="legal-document-layout"><aside className="legal-index"><span>NESTA PÁGINA</span><nav aria-label="Índice da política">{document.sections.map(section=><a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</nav><button className="mk-button" onClick={openPreferences}>Gerenciar cookies<Icon name="settings" size={16}/></button></aside><article className="legal-document">{document.sections.map(section=><section id={section.id} key={section.id}><h2>{section.title}</h2>{section.content}</section>)}{slug==='cookies'&&<div className="legal-cookie-cta"><h2>Revise sua escolha agora.</h2><p>A recusa dos opcionais mantém a navegação disponível.</p><button className="mk-button mk-button-red" onClick={openPreferences}>Abrir preferências de cookies</button></div>}<nav className="legal-related" aria-label="Outras políticas"><span>CONSULTE TAMBÉM</span>{legalDocuments.filter(item=>item.slug!==slug).map(item=><a href={`/${item.slug}`} key={item.slug}>{item.label}<Icon name="arrow" size={15}/></a>)}</nav></article></div>}
 </main>;
}

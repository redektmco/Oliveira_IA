import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Icon} from '../components/ui';
import {legalIdentity} from '../legal/identity';
import CookieConsentProvider,{useCookieConsent} from './CookieConsent';
import '../index.css';
import '../styles/brand.css';
import './public.css';

function PublicHeader(){
 const [open,setOpen]=useState(false);
 const toggle=useRef<HTMLButtonElement>(null);
 const header=useRef<HTMLElement>(null);
 const path=window.location.pathname;
 useEffect(()=>{
  const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&open){setOpen(false);toggle.current?.focus();}};
  const outside=(event:PointerEvent)=>{if(!header.current?.contains(event.target as Node))setOpen(false);};
  document.addEventListener('keydown',close);document.addEventListener('pointerdown',outside);
  return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',outside);};
 },[open]);
 return <header className="mk-header" ref={header} data-testid="public-header"><div className="mk-header-inner"><a className="mk-logo" href="/" aria-label="V4 Oliveira & Co, início"><img src="/brand/logo-dark.svg" alt="V4 Oliveira & Co"/></a>
  <nav id="public-navigation" className={open?'mk-navigation mk-navigation-open':'mk-navigation'} aria-label="Navegação principal do site" onClick={()=>setOpen(false)}>
   <a href="/" aria-current={path==='/'?'page':undefined}>Solução</a><a href="/#como-funciona">Como funciona</a><a href="/precos" aria-current={/^\/(precos|pricing)\/?$/.test(path)?'page':undefined}>Planos e preços</a><a href="/demo">Demonstração</a><a href="/legal" aria-current={/^\/(legal|privacidade|lgpd|cookies|reembolso|termos-de-uso)\/?$/.test(path)?'page':undefined}>Transparência</a>
  </nav><div className="mk-header-actions"><a className="mk-button mk-button-ink" href="/app">Entrar<Icon name="arrow" size={16}/></a><button ref={toggle} className="mk-menu-button" type="button" aria-label={open?'Fechar menu do site':'Abrir menu do site'} aria-expanded={open} aria-controls="public-navigation" onClick={()=>setOpen(!open)}><Icon name={open?'close':'more'} size={23}/></button></div>
 </div></header>;
}
function PublicFooter(){
 const {openPreferences}=useCookieConsent();
 return <footer className="mk-footer"><div className="mk-footer-top"><a href="/" className="mk-logo" aria-label="V4 Oliveira & Co, início"><img src="/brand/logo-dark.svg" alt="V4 Oliveira & Co"/></a><p>Atendimento, qualificação e CRM.<br/>Uma operação comercial conectada.</p><a href="/app#settings/billing">Já sou cliente <Icon name="arrow" size={15}/></a></div><nav aria-label="Políticas e informações legais"><a href="/privacidade">Política de privacidade</a><a href="/lgpd">LGPD e seus direitos</a><a href="/cookies">Política de cookies</a><a href="/reembolso">Cancelamento e reembolso</a><a href="/termos-de-uso">Termos de uso</a><button type="button" onClick={openPreferences}>Gerenciar cookies</button></nav><div className="mk-footer-bottom"><small>© {new Date().getFullYear()} V4 Oliveira & Co<br/>{legalIdentity.name}{legalIdentity.cnpj&&` · CNPJ ${legalIdentity.cnpj}`}</small><a href="/legal">Central de transparência</a></div></footer>;
}
export default function PublicLayout({children}:{children:ReactNode}){
 return <CookieConsentProvider><div className="mk-site"><a className="mk-skip" href="#public-content">Pular para o conteúdo</a><PublicHeader/><div id="public-content" tabIndex={-1}>{children}</div><PublicFooter/></div></CookieConsentProvider>;
}

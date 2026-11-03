import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {Icon} from '../components/ui';
import {CONSENT_KEY,createConsent,readConsent,clearOptionalPreferences,type CookieConsent} from './consent';

type ConsentContext={consent:CookieConsent|null;openPreferences:()=>void};
const Context=createContext<ConsentContext>({consent:null,openPreferences:()=>{}});
export const useCookieConsent=()=>useContext(Context);
export default function CookieConsentProvider({children}:{children:ReactNode}){
 const [consent,setConsent]=useState(readConsent);
 const [preferences,setPreferences]=useState(false);
 const [status,setStatus]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(!status)return;const timer=window.setTimeout(()=>setStatus(''),6000);return()=>window.clearTimeout(timer);},[status]);
 const openPreferences=()=>{setPreferences(consent?.preferences??false);dialog.current?.showModal();};
 useEffect(()=>{
  if(!consent?.preferences)clearOptionalPreferences();
 },[consent]);
 useEffect(()=>{
  const listener=(event:StorageEvent)=>{if(event.key===CONSENT_KEY||event.key===null){setConsent(readConsent());dialog.current?.close();}};
  window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener);
 },[]);
 function save(allow:boolean){
  const choice=createConsent(allow);let persisted=true;
  try{localStorage.setItem(CONSENT_KEY,JSON.stringify(choice));}catch{persisted=false;}
  if(!allow)clearOptionalPreferences();
  setConsent(choice);dialog.current?.close();
  setStatus(persisted?'Preferências de cookies salvas. Você pode alterá-las no rodapé.':'Escolha aplicada nesta visita. O navegador não permitiu armazenar sua preferência.');
 }
 return <Context.Provider value={{consent,openPreferences}}>{children}
  {!consent&&<section className="mk-cookie-banner" aria-label="Escolha de cookies" data-lenis-prevent><div><h2>Podemos lembrar suas preferências?</h2><p>Usamos só o armazenamento necessário ao site. Com sua autorização, lembramos sua simulação de preços neste navegador. Sem analytics ou publicidade. <a href="/cookies">Entenda os cookies</a>.</p></div><div className="mk-cookie-actions"><button className="mk-button" type="button" onClick={()=>save(false)}>Rejeitar opcionais</button><button className="mk-button" type="button" onClick={openPreferences}>Personalizar</button><button className="mk-button mk-button-red" type="button" onClick={()=>save(true)}>Aceitar opcionais</button></div></section>}
  <dialog className="mk-cookie-dialog" ref={dialog} aria-labelledby="cookie-dialog-title" data-lenis-prevent>
   <div className="mk-dialog-heading"><span className="mk-kicker">CENTRAL DE PREFERÊNCIAS</span><button type="button" className="mk-icon-button" aria-label="Fechar preferências de cookies" onClick={()=>dialog.current?.close()}><Icon name="close"/></button></div>
   <h2 id="cookie-dialog-title">Você decide o que fica.</h2><p>Recusar os opcionais não impede o acesso às páginas, aos planos ou à demonstração. O aceite de cookies não equivale à aceitação dos termos nem autoriza comunicações comerciais.</p>
   <form onSubmit={event=>{event.preventDefault();save(preferences);}}>
    <div className="mk-cookie-category"><label><input type="checkbox" checked disabled/><span><strong>Necessários</strong><small>Segurança, autenticação quando você entra na plataforma e registro desta escolha. Sempre ativos.</small></span></label></div>
    <div className="mk-cookie-category"><label><input type="checkbox" checked={preferences} onChange={event=>setPreferences(event.target.checked)}/><span><strong>Preferências de navegação</strong><small>Lembrar o plano e os pacotes escolhidos no simulador de preços, neste navegador. Opcional.</small></span></label></div>
    <div className="mk-cookie-unused"><strong>Analytics e publicidade: não utilizados</strong><p>Nenhum consentimento para essas finalidades é solicitado. Se novas ferramentas forem adotadas, esta central e a política deverão ser atualizadas antes da ativação.</p></div>
    <p className="mk-cookie-duration">Sua escolha vale por até 180 dias neste navegador. Você pode revogá-la a qualquer momento em “Gerenciar cookies”. <a href="/cookies">Ler a política de cookies</a>.</p>
    <div className="mk-dialog-actions"><button className="mk-button" type="button" onClick={()=>save(false)}>Rejeitar opcionais</button><button className="mk-button mk-button-red" type="submit">Salvar preferências</button></div>
   </form>
  </dialog>
  <div className="mk-consent-status" role="status">{status}</div>
 </Context.Provider>;
}

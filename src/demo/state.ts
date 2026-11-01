import { useCallback, useEffect, useRef, useState } from 'react';
import { frames } from './script';

const CHANNEL = 'oliveira-demo-v1';
const COMPANY_KEY = 'oliveira-demo-company';
export const defaultCompany = 'Clínica Vitalis';

/** `#3.2` = capítulo 3, passo 2. Permite recarregar a página sem perder o lugar na apresentação. */
function readFrame(): number {
  const match = /^#(\d+)\.(\d+)$/.exec(window.location.hash);
  if (!match) return 0;
  const index = frames.findIndex((frame) => frame.c === Number(match[1]) - 1 && frame.s === Number(match[2]) - 1);
  return index < 0 ? 0 : index;
}
function readCompany(): string {
  try {
    const param = new URLSearchParams(window.location.search).get('empresa')?.trim().slice(0, 40);
    if (param) { localStorage.setItem(COMPANY_KEY, param); return param; }
    return localStorage.getItem(COMPANY_KEY)?.slice(0, 40) || defaultCompany;
  } catch { return defaultCompany; }
}

/**
 * Estado compartilhado da demo: passo atual e nome da empresa do cliente.
 * A tela do cliente e o painel da apresentadora ficam sincronizados por BroadcastChannel (sem servidor).
 */
export function useDemo() {
  const [index, setIndex] = useState(readFrame);
  const [company, setCompanyState] = useState(readCompany);
  const channel = useRef<BroadcastChannel | null>(null);
  const indexRef = useRef(index); indexRef.current = index;
  const companyRef = useRef(company); companyRef.current = company;

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(CHANNEL); channel.current = bc;
    bc.onmessage = (event: MessageEvent<{ t: string; v?: number | string }>) => {
      const message = event.data;
      if (message.t === 'i' && typeof message.v === 'number') setIndex(Math.max(0, Math.min(frames.length - 1, message.v)));
      if (message.t === 'company' && typeof message.v === 'string') setCompanyState(message.v);
      if (message.t === 'hello') { bc.postMessage({ t: 'i', v: indexRef.current }); bc.postMessage({ t: 'company', v: companyRef.current }); }
    };
    bc.postMessage({ t: 'hello' });
    return () => { bc.close(); channel.current = null; };
  }, []);

  useEffect(() => {
    const frame = frames[index];
    try { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${frame.c + 1}.${frame.s + 1}`); } catch { /* o hash é opcional */ }
  }, [index]);

  const setFrame = useCallback((target: number) => {
    const next = Math.max(0, Math.min(frames.length - 1, target));
    setIndex(next);
    channel.current?.postMessage({ t: 'i', v: next });
  }, []);
  const next = useCallback(() => setFrame(indexRef.current + 1), [setFrame]);
  const prev = useCallback(() => setFrame(indexRef.current - 1), [setFrame]);
  const setCompany = useCallback((value: string) => {
    const clean = value.slice(0, 40);
    setCompanyState(clean);
    try { localStorage.setItem(COMPANY_KEY, clean); } catch { /* o nome vale só nesta visita */ }
    channel.current?.postMessage({ t: 'company', v: clean });
  }, []);
  return { index, frame: frames[index], setFrame, next, prev, company: company.trim() || defaultCompany, rawCompany: company, setCompany };
}

/** Atalhos de teclado compartilhados pela tela do cliente e pelo painel da apresentadora. */
export function useDemoKeys(handlers: { next: () => void; prev: () => void; first: () => void; last: () => void; chapter: (c: number) => void; extra?: (key: string) => void }) {
  const ref = useRef(handlers); ref.current = handlers;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      const onButton = Boolean(target && /^(BUTTON|A|SUMMARY)$/.test(target.tagName));
      const h = ref.current;
      const stop = () => event.preventDefault();
      switch (event.key) {
        case 'ArrowRight': case 'PageDown': stop(); h.next(); break;
        case ' ': case 'Enter': if (!onButton) { stop(); h.next(); } break;
        case 'ArrowLeft': case 'PageUp': case 'Backspace': stop(); h.prev(); break;
        case 'Home': stop(); h.first(); break;
        case 'End': stop(); h.last(); break;
        default:
          if (/^[0-9]$/.test(event.key)) { stop(); h.chapter(event.key === '0' ? 9 : Number(event.key) - 1); }
          else h.extra?.(event.key.toLowerCase());
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}

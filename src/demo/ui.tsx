import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/ui';

/** Ícones extras da demo, no mesmo traço do app (src/components/ui.tsx). */
const extra = {
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  repeat: <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3" />,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  webhook: <><circle cx="12" cy="6" r="3" /><circle cx="5" cy="18" r="3" /><circle cx="19" cy="18" r="3" /><path d="m10.5 8.5-4 6M13.5 8.5l4 6M8 18h8" /></>,
  megaphone: <path d="m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  video: <><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m22 8-6 4 6 4z" /></>,
} as const;
export type DName = IconName | keyof typeof extra;
export function DIcon({ name, size = 18 }: { name: DName; size?: number }) {
  if (name in extra) {
    return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{extra[name as keyof typeof extra]}</svg>;
  }
  return <Icon name={name as IconName} size={size} />;
}

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Número que sobe até o alvo. Parte do valor atual, então mudanças entre passos animam sem recomeçar. */
export function useCount(target: number, ms = 1100) {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0));
  const from = useRef(value);
  useEffect(() => {
    if (reducedMotion()) { from.current = target; setValue(target); return; }
    const start = performance.now(), origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms), eased = 1 - Math.pow(1 - p, 3);
      const next = origin + (target - origin) * eased;
      from.current = next; setValue(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
export function Count({ to, prefix = '', suffix = '', ms }: { to: number; prefix?: string; suffix?: string; ms?: number }) {
  const value = useCount(to, ms);
  return <>{prefix}{Math.round(value).toLocaleString('pt-BR')}{suffix}</>;
}

export const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Elemento que a closer pode clicar: anel pulsante + rótulo, e o clique avança o roteiro. */
export function Hot({ on, go, hint = 'Clique aqui', className = '', radius, children }: { on: boolean; go: () => void; hint?: string; className?: string; radius?: string; children: ReactNode }) {
  return <div className={`dm-wrap ${on ? 'dm-hot' : ''} ${className}`} data-hint={on ? hint : undefined} onClick={on ? go : undefined} role={on ? 'button' : undefined} style={radius ? ({ '--hr': radius } as CSSProperties) : undefined}>{children}</div>;
}

/** Quebra o texto em palavras que aparecem em sequência, para dar ritmo de digitação sem JavaScript. */
export function Words({ text, base = 0, step = 28 }: { text: string; base?: number; step?: number }) {
  return <>{text.split(' ').map((word, index) => <span className="dm-word" key={index} style={{ animationDelay: `${base + index * step}ms` }}>{word} </span>)}</>;
}

/** Próxima quinta-feira (ou a seguinte, se hoje já for quinta depois das 14h): data da reunião do exemplo. */
export function meetingDay() {
  const date = new Date();
  date.setHours(14, 30, 0, 0);
  const ahead = (4 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + ahead);
  return date;
}
export const weekdayShort = (date: Date) => date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
export const monthShort = (date: Date) => date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();

export function initials(name: string) {
  return name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

import { useEffect, useState } from 'react';
import { chapters, frameIndex, frames, totalMinutes } from './script';
import type { useDemo } from './state';
import { DIcon } from './ui';

const fill = (text: string, company: string) => text.replace(/\{empresa\}/g, company);
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

/** Painel da apresentadora: fica em outra janela (ou celular) e controla a tela compartilhada com o cliente. */
export default function Presenter({ demo }: { demo: ReturnType<typeof useDemo> }) {
  const { index, frame, setFrame, next, prev, company } = demo;
  const chapter = chapters[frame.c], step = chapter.steps[frame.s];
  const upcoming = frames[index + 1] ? chapters[frames[index + 1].c].steps[frames[index + 1].s] : null;
  const upcomingChapter = frames[index + 1] ? chapters[frames[index + 1].c] : null;
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => { if (index > 0) setRunning(true); }, [index]);
  useEffect(() => { if (!running) return; const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [running]);

  const planned = chapters.slice(0, frame.c).reduce((sum, c) => sum + c.minutes, 0);
  const late = seconds / 60 > planned + chapter.minutes + 2;
  return <div className="dm-pres">
    <header className="dm-pres-top">
      <img className="brand-logo on-dark" src="/brand/logo-light.svg" alt="V4 Oliveira & Co" /><img className="brand-logo on-light" src="/brand/logo-dark.svg" alt="V4 Oliveira & Co" />
      <span className="dm-tag"><i /> Painel da apresentadora</span>
      <div className="dm-timer" title="Tempo de reunião"><DIcon name="clock" size={14} /><b className={late ? 'late' : ''}>{clock(seconds)}</b><small>de ~{totalMinutes} min</small>
        <button onClick={() => setRunning((value) => !value)} aria-label={running ? 'Pausar cronômetro' : 'Iniciar cronômetro'}>{running ? 'Pausar' : 'Iniciar'}</button><button onClick={() => { setSeconds(0); setRunning(false); }}>Zerar</button></div>
    </header>
    <div className="dm-pres-grid">
      <main className="dm-pres-main">
        <label className="dm-pres-company"><span>Empresa do cliente</span><input value={demo.rawCompany} onChange={(event) => demo.setCompany(event.target.value)} maxLength={40} /></label>
        <div className="dm-pres-where"><span>Capítulo {frame.c + 1} de {chapters.length}</span><span>Passo {frame.s + 1} de {chapter.steps.length}</span></div>
        <h1>{chapter.title}</h1>
        <div className="dm-pres-now" key={index}>
          <h2>{fill(step.title, company)}</h2><p>{fill(step.text, company)}</p>
          {step.hot && <div className="dm-pres-hot"><i /> Clique no elemento destacado: <b>{step.hot}</b></div>}
          <h3>O que falar</h3>
          <ul>{step.say.map((line) => <li key={line}>{fill(line, company)}</li>)}</ul>
          {step.tip && <div className="dm-pres-tip"><DIcon name="bolt" size={15} /><span>{fill(step.tip, company)}</span></div>}
        </div>
      </main>
      <aside className="dm-pres-side">
        {upcoming && upcomingChapter && <div className="dm-pres-next"><small>A seguir{upcomingChapter !== chapter ? ' · novo capítulo' : ''}</small><b>{upcomingChapter !== chapter ? `${upcomingChapter.title}: ` : ''}{fill(upcoming.title, company)}</b></div>}
        <nav className="dm-pres-chapters" aria-label="Capítulos">
          {chapters.map((c, ci) => <button key={c.id} className={ci === frame.c ? 'current' : ci < frame.c ? 'done' : ''} onClick={() => setFrame(frameIndex(ci))}><span>{ci + 1}</span>{c.title}<small>{c.minutes} min</small></button>)}
        </nav>
        <p className="dm-pres-keys">Teclas: <kbd>→</kbd> <kbd>Espaço</kbd> avançam · <kbd>←</kbd> volta · <kbd>1</kbd>–<kbd>9</kbd> capítulos</p>
        <p className="dm-pres-keys">Mantenha esta janela fora do compartilhamento de tela. A tela do cliente é <b>/demo</b>.</p>
      </aside>
    </div>
    <footer className="dm-pres-ctl">
      <button onClick={prev} disabled={index === 0}><DIcon name="chevronLeft" size={20} /> Voltar</button>
      <button className="primary" onClick={next} disabled={index === frames.length - 1}>Próximo <DIcon name="chevron" size={20} /></button>
    </footer>
  </div>;
}

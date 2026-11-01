import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export default function Auth({onDemo, recovery = false}: {onDemo: () => void; recovery?: boolean}) {
  const [mode, setMode] = useState<'login'|'signup'|'reset'|'password'>(recovery ? 'password' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase || pending) return;
    setPending(true); setError(''); setNotice('');
    try {
      if (mode === 'password') {
        const result = await supabase.auth.updateUser({password});
        if (result.error) throw result.error;
        window.location.assign(window.location.origin+window.location.search);
      } else if (mode === 'reset') {
        const result = await supabase.auth.resetPasswordForEmail(email, {redirectTo: window.location.origin});
        if (result.error) throw result.error;
        setNotice('Se a conta existir, enviaremos um link para redefinir a senha.');
      } else if (mode === 'signup') {
        const result = await supabase.auth.signUp({email, password, options: {emailRedirectTo: window.location.origin+window.location.search}});
        if (result.error) throw result.error;
        if (!result.data.session) setNotice('Confirme seu e-mail para ativar a conta e depois entre.');
      } else {
        const result = await supabase.auth.signInWithPassword({email, password});
        if (result.error) throw result.error;
      }
    } catch { setError('Não foi possível concluir. Confira os dados, a confirmação do e-mail e a configuração do Supabase.'); }
    finally { setPending(false); }
  };
  return <div className="auth-screen"><section className="auth-story"><div className="auth-brand"><span className="brand-mark">V4</span> Oliveira IA</div><span className="auth-eyebrow">SEU PRÓXIMO PASSO COMERCIAL</span><h1>Mais conversas.<br/>Mais oportunidades.</h1><p>Uma operação comercial organizada, com agentes de IA e a sua equipe no controle.</p><div className="auth-features"><span>01 · Centralize contatos e oportunidades</span><span>02 · Configure agentes com seu conhecimento</span><span>03 · Teste e acompanhe cada conversa</span></div><small>SDR AI por Oliveira & Co.</small></section>
    <section className="auth-panel"><div className="auth-form"><span className="eyebrow">BEM-VINDO À SUA OPERAÇÃO</span><h2>{mode === 'signup' ? 'Crie sua conta' : mode === 'reset' ? 'Recupere seu acesso' : mode === 'password' ? 'Escolha uma nova senha' : 'Entre no seu workspace'}</h2><p>Seus contatos, agentes e conversas em um só lugar.</p>
      {!supabase ? <div className="notice-box">A conexão com o Supabase ainda não foi configurada. Você pode explorar a demonstração local enquanto prepara a implantação.</div> : <form onSubmit={submit}>
        {mode !== 'password' && <label><span>E-mail</span><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="voce@empresa.com.br"/></label>}
        {mode !== 'reset' && <label><span>Senha</span><input type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="No mínimo 8 caracteres"/></label>}
        {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="notice-box">{notice}</p>}
        <button className="btn btn-primary auth-submit" disabled={pending}>{pending ? 'Aguarde…' : mode === 'signup' ? 'Criar conta' : mode === 'reset' ? 'Enviar link' : mode === 'password' ? 'Salvar nova senha' : 'Entrar'}</button>
      </form>}
      {supabase && mode==='login'&&<button type="button" className="btn auth-submit" disabled={pending} onClick={async()=>{if(!supabase)return;setPending(true);setError('');const r=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.search}});if(r.error){setError('Não foi possível iniciar o login Google. Confira se ele foi habilitado pelo administrador.');setPending(false);}}}>Entrar com Google</button>}
      {supabase && mode !== 'password' && <div className="auth-links"><button onClick={() => {setMode(mode === 'login' ? 'signup' : 'login');setError('');setNotice('');}}>{mode === 'login' ? 'Criar conta' : 'Voltar para entrar'}</button>{mode === 'login' && <button onClick={() => setMode('reset')}>Esqueci minha senha</button>}</div>}
      {mode !== 'password' && <><div className="auth-divider"><span>conheça a plataforma</span></div><button className="btn auth-submit" onClick={onDemo}>Explorar demonstração</button><small className="auth-caption">Dados fictícios, salvos apenas neste navegador. A demonstração não consome créditos de IA.</small></>}
    </div></section></div>;
}

import { useEffect, useState, type FormEvent } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { takeAuthNotice } from '../lib/auth-notice';

type Mode = 'login' | 'signup' | 'reset' | 'password';
const redirect = () => window.location.origin + window.location.search;

/** Maps Supabase Auth errors to actionable messages without revealing whether an account exists. */
export function authMessage(error: Pick<AuthError, 'code' | 'status' | 'message'> | null | undefined, mode: Mode): string {
  const code = error?.code ?? '';
  const text = error?.message?.toLowerCase() ?? '';
  if (code === 'email_not_confirmed' || text.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Use o link enviado ou reenvie a confirmação abaixo.';
  if (code === 'invalid_credentials' || text.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error?.status === 429) return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  if (code === 'weak_password' || text.includes('password should')) return 'Senha fraca. Use pelo menos 8 caracteres com letras e números.';
  if (code === 'same_password') return 'A nova senha precisa ser diferente da atual.';
  if (code === 'signup_disabled' || text.includes('signups not allowed')) return 'Novos cadastros estão fechados. Peça um convite ao administrador do workspace.';
  if (code === 'user_banned') return 'Este acesso foi bloqueado. Fale com o administrador do workspace.';
  if (code === 'session_not_found' || code === 'session_expired' || code === 'refresh_token_not_found') return 'O link expirou. Solicite um novo link de recuperação.';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'Informe um e-mail válido.';
  if (error?.status && error.status >= 500) return 'O serviço de autenticação está indisponível. Tente novamente em instantes.';
  if (text.includes('fetch') || text.includes('network')) return 'Sem conexão com o serviço de autenticação. Verifique sua internet.';
  return mode === 'reset' ? 'Não foi possível enviar o link. Tente novamente.' : 'Não foi possível concluir. Confira os dados e tente novamente.';
}
export function passwordProblem(password: string) {
  if (password.length < 8) return 'Use pelo menos 8 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return 'Combine letras e números.';
  return '';
}
/** Supabase reports expired or reused e-mail links in the URL hash. */
function linkError() {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
  const code = params.get('error_code') || params.get('error');
  if (!code) return '';
  history.replaceState(null, '', window.location.pathname + window.location.search.replace(/[?&](error|error_code|error_description)=[^&]*/g, '').replace(/^&/, '?'));
  return code === 'otp_expired' ? 'Este link expirou ou já foi usado. Solicite um novo abaixo.' : 'Não foi possível validar o link. Solicite um novo.';
}

export default function Auth({ onDemo, recovery = false }: { onDemo: () => void; recovery?: boolean }) {
  const [mode, setMode] = useState<Mode>(recovery ? 'password' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(() => linkError());
  const [notice, setNotice] = useState(() => takeAuthNotice());
  const [unconfirmed, setUnconfirmed] = useState(false);
  useEffect(() => { if (recovery) setMode('password'); }, [recovery]);
  const switchMode = (next: Mode) => { setMode(next); setError(''); setNotice(''); setUnconfirmed(false); setConfirm(''); };
  const needsConfirm = mode === 'signup' || mode === 'password';

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase || pending) return;
    setError(''); setNotice(''); setUnconfirmed(false);
    const address = email.trim().toLowerCase();
    if (needsConfirm) {
      const problem = passwordProblem(password);
      if (problem) { setError(problem); return; }
      if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    }
    setPending(true);
    try {
      if (mode === 'password') {
        const result = await supabase.auth.updateUser({ password });
        if (result.error) throw result.error;
        // Clean the recovery tokens from the URL and enter with the new password.
        window.location.assign(redirect());
      } else if (mode === 'reset') {
        const result = await supabase.auth.resetPasswordForEmail(address, { redirectTo: redirect() });
        if (result.error && (result.error.status === 429 || (result.error.status ?? 0) >= 500)) throw result.error;
        setNotice('Se houver uma conta com este e-mail, enviaremos um link para redefinir a senha. Confira também o spam.');
      } else if (mode === 'signup') {
        const result = await supabase.auth.signUp({ email: address, password, options: { emailRedirectTo: redirect() } });
        if (result.error) throw result.error;
        if (!result.data.session) { setNotice('Enviamos um link de confirmação para o seu e-mail. Confirme e depois entre.'); switchToLoginKeepNotice(); }
      } else {
        const result = await supabase.auth.signInWithPassword({ email: address, password });
        if (result.error) {
          if (result.error.code === 'email_not_confirmed' || /not confirmed/i.test(result.error.message)) setUnconfirmed(true);
          throw result.error;
        }
      }
    } catch (cause) { setError(authMessage(cause as AuthError, mode)); }
    finally { setPending(false); }
  };
  function switchToLoginKeepNotice() { setMode('login'); setPassword(''); setConfirm(''); }
  const resend = async () => {
    if (!supabase || pending) return;
    setPending(true); setError('');
    const result = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: redirect() } });
    setPending(false);
    if (result.error) setError(authMessage(result.error, 'login'));
    else { setUnconfirmed(false); setNotice('Se a conta estiver pendente, enviamos um novo link de confirmação.'); }
  };
  const google = async () => {
    if (!supabase || pending) return;
    setPending(true); setError('');
    const result = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect() } });
    if (result.error) { setError('Não foi possível iniciar o login Google. Confira se ele foi habilitado pelo administrador.'); setPending(false); }
  };

  const title = mode === 'signup' ? 'Crie sua conta' : mode === 'reset' ? 'Recupere seu acesso' : mode === 'password' ? 'Escolha uma nova senha' : 'Entre no seu workspace';
  const subtitle = mode === 'reset' ? 'Informe o e-mail da sua conta para receber um link de redefinição.' : mode === 'password' ? 'Defina a senha que você usará para entrar.' : 'Seus contatos, agentes e conversas em um só lugar.';
  return <div className="auth-screen"><section className="auth-story"><div className="auth-brand"><span className="brand-mark">V4</span> Oliveira IA</div><span className="auth-eyebrow">SEU PRÓXIMO PASSO COMERCIAL</span><h1>Mais conversas.<br />Mais oportunidades.</h1><p>Uma operação comercial organizada, com agentes de IA e a sua equipe no controle.</p><div className="auth-features"><span>01 · Centralize contatos e oportunidades</span><span>02 · Configure agentes com seu conhecimento</span><span>03 · Teste e acompanhe cada conversa</span></div><small>SDR AI por Oliveira & Co.</small></section>
    <section className="auth-panel"><div className="auth-form"><span className="eyebrow">BEM-VINDO À SUA OPERAÇÃO</span><h2>{title}</h2><p>{subtitle}</p>
      {!supabase ? <div className="notice-box">A conexão com o Supabase ainda não foi configurada. Você pode explorar a demonstração local enquanto prepara a implantação.</div> : <form onSubmit={submit}>
        {mode !== 'password' && <label><span>E-mail</span><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} placeholder="voce@empresa.com.br" /></label>}
        {mode !== 'reset' && <label><span>{mode === 'password' ? 'Nova senha' : 'Senha'}</span><span className="auth-password"><input type={show ? 'text' : 'password'} minLength={8} maxLength={72} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder={mode === 'login' ? 'Sua senha' : 'Mínimo 8 caracteres, letras e números'} /><button type="button" className="auth-reveal" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={show}>{show ? 'Ocultar' : 'Mostrar'}</button></span></label>}
        {needsConfirm && <label><span>Confirme a senha</span><input type={show ? 'text' : 'password'} minLength={8} maxLength={72} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></label>}
        {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="notice-box">{notice}</p>}
        {unconfirmed && <button type="button" className="btn auth-submit" disabled={pending || !email} onClick={() => void resend()}>Reenviar e-mail de confirmação</button>}
        <button className="btn btn-primary auth-submit" disabled={pending}>{pending ? 'Aguarde…' : mode === 'signup' ? 'Criar conta' : mode === 'reset' ? 'Enviar link' : mode === 'password' ? 'Salvar nova senha' : 'Entrar'}</button>
      </form>}
      {supabase && mode === 'login' && <button type="button" className="btn auth-submit" disabled={pending} onClick={() => void google()}>Entrar com Google</button>}
      {supabase && mode !== 'password' && <div className="auth-links"><button type="button" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Criar conta' : 'Voltar para entrar'}</button>{mode === 'login' && <button type="button" onClick={() => switchMode('reset')}>Esqueci minha senha</button>}</div>}
      {mode !== 'password' && <><div className="auth-divider"><span>conheça a plataforma</span></div><button type="button" className="btn auth-submit" onClick={onDemo}>Explorar demonstração</button><small className="auth-caption">Dados fictícios, salvos apenas neste navegador. A demonstração não consome créditos de IA.</small></>}
    </div></section></div>;
}

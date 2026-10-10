import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, Eye, EyeOff, LoaderCircle, LogIn, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { authApi, AuthApiError, type AuthAccount } from './authApi';
import { AUTH_CHECK_EVENT } from './socketAccess';
import { strings, type Locale } from './strings';
import './AuthGate.css';

type Mode = 'login' | 'register' | 'confirm' | 'forgot' | 'reset';
type Phase = 'checking' | 'unreachable' | 'screen' | 'open';

/**
 * Renders the app only for a signed-in account with a confirmed ETH email; otherwise shows the log-in screens.
 * The server enforces this independently, so the gate is a convenience, never the security boundary.
 */
export function AuthGate({ locale = 'en', children }: { locale?: Locale; children: ReactNode }) {
  const t = strings[locale];
  const [phase, setPhase] = useState<Phase>('checking');
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [identifier, setIdentifier] = useState('');
  const [notice, setNotice] = useState('');

  const check = useCallback(async () => {
    setPhase('checking');
    try {
      const status = await authApi.status();
      if (!status.required || status.account?.verified) { setAccount(status.account); setPhase('open'); return; }
      if (status.account) { setIdentifier(status.account.username); setMode('confirm'); setNotice(t.confirmPending); }
      setPhase('screen');
    } catch { setPhase('unreachable'); }
  }, [t]);
  useEffect(() => { void check(); }, [check]);

  // Access can end while the app is open: the session expires or is revoked (401 login_required), the confirmation runs out
  // (403 verification_required) or the account is disabled (403 account_disabled), or the server drops the live socket.
  // Ask the server what changed and show the matching screen; leave the app alone if everything is in fact fine.
  const recheck = useCallback(async () => {
    const status = await authApi.status().catch(() => null);
    if (!status || !status.required || status.account?.verified) return;
    const lost = status.account;
    if (!lost) { setMode('login'); setNotice(t.sessionEnded); }
    else if (lost.status === 'disabled') { setMode('login'); setNotice(t.errors.account_disabled); }
    else {
      setIdentifier(lost.username); setMode('confirm');
      setNotice(lost.status === 'expired' ? t.reconfirm : t.confirmPending);
      if (lost.status === 'expired') void authApi.resend(lost.username).catch(() => {});
    }
    setPhase('screen');
  }, [t]);
  useEffect(() => {
    if (phase !== 'open') return;
    const original = window.fetch;
    window.fetch = async (...args) => {
      const response = await original(...args);
      const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof URL ? args[0].pathname : (args[0] as Request).url;
      if ((response.status === 401 || response.status === 403) && /\/api\/(?!auth\/)/.test(url)) {
        const body = await response.clone().json().catch(() => null);
        if (['login_required', 'verification_required', 'account_disabled'].includes(body?.code)) void recheck();
      }
      return response;
    };
    const onCheck = () => void recheck();
    window.addEventListener(AUTH_CHECK_EVENT, onCheck);
    return () => { window.fetch = original; window.removeEventListener(AUTH_CHECK_EVENT, onCheck); };
  }, [phase, recheck]);

  const enter = (next: AuthAccount) => { setAccount(next); setNotice(''); setPhase('open'); };
  const logout = async () => { try { await authApi.logout(); } finally { location.reload(); } };

  if (phase === 'open') return <>{children}{account && <AccountChip account={account} label={t.loggedInAs} logout={t.logout} onLogout={logout} />}</>;
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><BookOpen size={23} strokeWidth={1.8} /><span>{t.brand}</span></div>
        {phase === 'checking' && <p className="auth-status" role="status"><LoaderCircle className="auth-spin" size={18} /> {t.checking}</p>}
        {phase === 'unreachable' && <>
          <h1 id="auth-title">{t.unreachable}</h1>
          <button className="auth-primary" onClick={() => void check()}>{t.retry}</button>
        </>}
        {phase === 'screen' && <Screens {...{ t, mode, setMode, identifier, setIdentifier, notice, setNotice, enter }} />}
      </section>
    </main>
  );
}

type T = (typeof strings)['en'];
interface ScreenProps { t: T; mode: Mode; setMode(m: Mode): void; identifier: string; setIdentifier(v: string): void; notice: string; setNotice(v: string): void; enter(a: AuthAccount): void }

function Screens({ t, mode, setMode, identifier, setIdentifier, notice, setNotice, enter }: ScreenProps) {
  const [password, setPassword] = useState(''), [code, setCode] = useState('');
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [sentTo, setSentTo] = useState(''), [cooldown, setCooldown] = useState(0);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { first.current?.focus(); }, [mode]);
  useEffect(() => { if (cooldown <= 0) return; const id = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(id); }, [cooldown]);

  const explain = (e: unknown) => {
    const err = e instanceof AuthApiError ? e : new AuthApiError('server', 'server');
    const wait = err.retryAfterSeconds ? ` (${Math.ceil(err.retryAfterSeconds / 60) > 1 ? `${Math.ceil(err.retryAfterSeconds / 60)} min` : `${err.retryAfterSeconds} s`})` : '';
    return (t.errors[err.code ?? ''] ?? err.message) + (err.code === 'rate_limited' ? wait : '');
  };
  const go = (next: Mode) => { setMode(next); setError(''); setNotice(''); setCode(''); setPassword(''); };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) {
      setError(explain(e));
      if (e instanceof AuthApiError && e.code === 'not_verified') { setMode('confirm'); void authApi.resend(identifier).catch(() => {}); setCooldown(60); }
    } finally { setBusy(false); }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (mode === 'login') enter((await authApi.login(identifier, password)).account);
      else if (mode === 'register') { const r = await authApi.register(identifier, password); setSentTo(r.sentTo); setCooldown(60); go('confirm'); setNotice(''); }
      else if (mode === 'confirm') enter((await authApi.verify(identifier, code)).account);
      else if (mode === 'forgot') { await authApi.forgot(identifier); go('reset'); }
      else { await authApi.reset(identifier, code, password); go('login'); setNotice(t.resetDone); }
    });
  };
  const resend = () => void run(async () => { await authApi.resend(identifier); setCooldown(60); setNotice(t.resent); });

  const tabs = mode === 'login' || mode === 'register';
  const title = mode === 'confirm' ? t.confirmTitle : mode === 'forgot' ? t.forgotTitle : mode === 'reset' ? t.resetTitle : t.tagline;
  const body = mode === 'confirm' ? (sentTo ? t.confirmBody(sentTo) : notice) : mode === 'forgot' ? t.forgotBody : mode === 'reset' ? t.resetBody : '';
  const needsId = mode !== 'confirm' || !identifier;
  const needsPassword = mode === 'login' || mode === 'register' || mode === 'reset';
  const needsCode = mode === 'confirm' || mode === 'reset';
  const submitLabel = { login: t.submitLogin, register: t.submitRegister, confirm: t.submitConfirm, forgot: t.submitForgot, reset: t.submitReset }[mode];

  return (
    <>
      {tabs && <div className="auth-tabs" role="tablist">
        {(['login', 'register'] as const).map(m => <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => go(m)}>{m === 'login' ? t.login : t.register}</button>)}
      </div>}
      {!tabs && <button type="button" className="auth-back" onClick={() => go('login')}><ArrowLeft size={15} /> {t.back}</button>}
      <h1 id="auth-title" className={tabs ? 'auth-lede' : ''}>{title}</h1>
      {body && <p className="auth-body">{body}</p>}
      {notice && mode !== 'confirm' && <p className="auth-notice" role="status">{notice}</p>}
      {mode === 'confirm' && notice && sentTo && <p className="auth-notice" role="status">{notice}</p>}
      <form onSubmit={submit} noValidate>
        {needsId && <Field label={t.identifier} hint={t.identifierHint}>
          <input ref={first} value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
        </Field>}
        {needsCode && <Field label={t.code} hint={t.codeHint}>
          <input ref={needsId ? undefined : first} className="auth-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} placeholder="000000" required />
        </Field>}
        {needsPassword && <Field label={mode === 'reset' ? t.newPassword : t.password} hint={mode === 'login' ? undefined : t.passwordHint}>
          <div className="auth-password">
            <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? t.hidePassword : t.showPassword}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </Field>}
        <p className="auth-error" role="alert" aria-live="assertive">{error}</p>
        <button className="auth-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="auth-spin" size={16} /> : mode === 'confirm' ? <ShieldCheck size={16} /> : mode === 'login' ? <LogIn size={16} /> : <Mail size={16} />}{submitLabel}</button>
      </form>
      <div className="auth-links">
        {mode === 'login' && <button type="button" onClick={() => go('forgot')}>{t.forgot}</button>}
        {mode === 'confirm' && <button type="button" onClick={resend} disabled={busy || cooldown > 0}>{cooldown > 0 ? t.resendIn(cooldown) : t.resend}</button>}
      </div>
      {(mode === 'register' || mode === 'forgot') && <p className="auth-fine">{t.studentNote}</p>}
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="auth-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function AccountChip({ account, label, logout, onLogout }: { account: AuthAccount; label: string; logout: string; onLogout(): void }) {
  return (
    <div className="auth-chip">
      <span>{label} <strong>{account.username}</strong></span>
      <button onClick={onLogout} aria-label={logout} title={logout}><LogOut size={14} /></button>
    </div>
  );
}

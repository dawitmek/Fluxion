import { useState, type FormEvent } from 'react';
import { api } from './api';
import { Logo } from './icons';
import { Link, navigate } from './router';
import { ErrorNotice, useError } from './ui';

// Only same-site paths, so a crafted ?next= can't send someone elsewhere after logging in.
function nextPath() {
  const next = new URLSearchParams(location.search).get('next');
  return next?.startsWith('/dashboard') ? next : '/dashboard';
}

export function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, guard } = useError();
  const login = mode === 'login';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    guard(() => api('POST', `/auth/${mode}`, { email, password }).then(() => navigate(nextPath(), { replace: true })))();
  };

  return (
    <div className="auth">
      <Link href="/" className="brand">
        <Logo />
        Fluxion
      </Link>
      <form className="card stack auth-card" onSubmit={submit}>
        <div>
          <h1>{login ? 'Welcome back' : 'Create your account'}</h1>
          <p className="muted">{login ? 'Log in to your dashboard.' : 'Free, and it takes a minute.'}</p>
        </div>
        <ErrorNotice error={error} />
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="field">
          Password
          {!login && <span className="hint">At least 8 characters.</span>}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete={login ? 'current-password' : 'new-password'}
          />
        </label>
        <button className="btn btn-primary btn-lg">{login ? 'Log in' : 'Create account'}</button>
        <p className="muted" style={{ textAlign: 'center' }}>
          {login ? 'New to Fluxion? ' : 'Already have an account? '}
          <Link href={login ? '/signup' : '/login'}>{login ? 'Create an account' : 'Log in'}</Link>
        </p>
      </form>
    </div>
  );
}

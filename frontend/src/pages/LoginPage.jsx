import { useState } from 'react';
import { api } from '../api';
import AppBrand from '../components/AppBrand';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [twofaCode, setTwofaCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();

    const cleanUsername = username.trim();

    if (!cleanUsername || !password) {
      setError('יש למלא שם משתמש וסיסמה');
      return;
    }

    if (needs2FA && !twofaCode.trim()) {
      setError('יש להזין קוד 2FA');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await api.login({
        username: cleanUsername,
        password,
        code: needs2FA ? twofaCode.trim() : undefined
      });

      if (result.requires2FA) {
        setNeeds2FA(true);
        setTwofaCode('');
        setError('');
        return;
      }

      localStorage.setItem('user', JSON.stringify(result.user));
      onLogin(result.user);
    } catch (err) {
      setError(err.message || 'שגיאת התחברות');
    } finally {
      setLoading(false);
    }
  }

  function resetLogin() {
    setNeeds2FA(false);
    setTwofaCode('');
    setPassword('');
    setError('');
  }

  return (
    <div className="login-screen">
      <div className="login-card glass-card card">
        <AppBrand />

        <div className="section-chip">Secure Login</div>
        <h1 className="login-title">התחברות מאובטחת</h1>
        <p className="login-subtitle">
          כניסה עם סיסמה מוצפנת בשרת, JWT, ואימות דו־שלבי כאשר מופעל.
        </p>

        <form className="row-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>שם משתמש</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={needs2FA || loading}
            />
          </label>

          <label className="field">
            <span>סיסמה</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={needs2FA || loading}
            />
          </label>

          {needs2FA && (
            <label className="field">
              <span>קוד 2FA</span>
              <input
                value={twofaCode}
                onChange={(e) => setTwofaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 ספרות מאפליקציית Authenticator"
                disabled={loading}
              />
            </label>
          )}

          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? 'בודק...' : needs2FA ? 'אמת קוד וכניסה' : 'כניסה'}
          </button>

          {needs2FA && (
            <button
              type="button"
              className="secondary-btn"
              onClick={resetLogin}
              disabled={loading}
            >
              חזרה להזנת משתמש
            </button>
          )}
        </form>

        <div className="login-tip">
          הסיסמה לא נשמרת בקוד. השרת שומר hash בלבד ומחזיר token חתום לאחר התחברות.
        </div>

        {error && <div className="error-box">{error}</div>}
      </div>
    </div>
  );
}

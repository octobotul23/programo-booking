import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SIGNED_OUT, api } from './api.js';
import { useI18n } from './i18n.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { setLang } = useI18n();
  const [state, setState] = useState({ loading: true, user: null, businesses: [] });

  const apply = useCallback(
    (data) => {
      setState({ loading: false, user: data.user, businesses: data.businesses ?? [] });
      return data;
    },
    [],
  );

  const refresh = useCallback(() => api('/auth/me').then(apply), [apply]);

  useEffect(() => {
    refresh().catch(() => setState({ loading: false, user: null, businesses: [] }));
  }, [refresh]);

  // a request found the session gone: forget the user, so the page guard sends them to log in (and back)
  useEffect(() => {
    const out = () => setState((s) => (s.user ? { loading: false, user: null, businesses: [] } : s));
    window.addEventListener(SIGNED_OUT, out);
    return () => window.removeEventListener(SIGNED_OUT, out);
  }, []);

  // with two-factor on, the password step answers { twoFactor, ticket } and the code step logs in
  const login = useCallback(
    async (email, password) => {
      const res = await api('/auth/login', { method: 'POST', body: { email, password } });
      if (res.twoFactor) return res;
      const data = apply(res);
      if (data.user?.lang) setLang(data.user.lang);
      return data;
    },
    [apply, setLang],
  );
  const loginCode = useCallback(
    async (ticket, code) => {
      const data = apply(await api('/auth/login/code', { method: 'POST', body: { ticket, code } }));
      if (data.user?.lang) setLang(data.user.lang);
      return data;
    },
    [apply, setLang],
  );
  const register = useCallback((body) => api('/auth/register', { method: 'POST', body }).then(apply), [apply]);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setState({ loading: false, user: null, businesses: [] });
  }, []);
  const updateMe = useCallback((body) => api('/auth/me', { method: 'PATCH', body }).then(apply), [apply]);

  const value = useMemo(() => ({ ...state, refresh, login, loginCode, register, logout, updateMe }), [state, refresh, login, loginCode, register, logout, updateMe]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Where a user should land after logging in. */
export const homeFor = (user, businesses) => {
  if (!user) return '/';
  if (user.role === 'client') return '/me';
  if (businesses.length) return `/app/${businesses[0].id}`;
  return user.role === 'business' ? '/onboarding' : '/';
};

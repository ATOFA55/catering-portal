import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, post, setToken, setUnauthorizedHandler } from './api';

export type Scope = 'ALL' | 'OWN' | 'ASSIGNED';
export interface Me {
  id: number; name: string; email: string; isSuperAdmin: boolean;
  role: { id: number; code: string; name: string; homePath: string };
  permissions: Record<string, Scope>;
}

export interface RegisterInput { name: string; email: string; password: string; phone?: string; company?: string; }

interface AuthCtx {
  me: Me | null; loading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  register: (input: RegisterInput) => Promise<Me>;
  logout: () => void;
  can: (...perms: string[]) => boolean;
  scope: (perm: string) => Scope | undefined;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  const logout = useCallback(() => { setToken(null); setMe(null); }, []);
  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);
  useEffect(() => {
    if (!getToken()) return;
    api<Me>('/auth/me').then(setMe).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const r = await post<{ token: string; user: Me }>('/auth/login', { email, password });
    setToken(r.token);
    setMe(r.user);
    return r.user;
  };
  const register = async (input: RegisterInput) => {
    const r = await post<{ token: string; user: Me }>('/auth/register', input);
    setToken(r.token);
    setMe(r.user);
    return r.user;
  };
  const can = (...perms: string[]) => !!me && perms.some((p) => p in me.permissions);
  const scope = (perm: string) => me?.permissions[perm];
  return <Ctx.Provider value={{ me, loading, login, register, logout, can, scope }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

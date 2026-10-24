import { Scope } from '../db/schema';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  roleId: number;
  roleCode: string;
  roleName: string;
  homePath: string;
  isSuperAdmin: boolean;
  perms: Record<string, Scope>;
}

export const scopeOf = (u: AuthUser, perm: string): Scope | undefined => u.perms[perm];
export const can = (u: AuthUser, perm: string) => perm in u.perms;

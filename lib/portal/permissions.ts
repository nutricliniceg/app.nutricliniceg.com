import type { PortalPermissions } from './portal.schema';
import { PORTAL_PERMISSIONS } from './portal.schema';

// PP-02 permission gates (pure). Stored as JSON on the token row.

export const FULL_PERMISSIONS: PortalPermissions = {
  view_plans: true,
  send_weight: true,
  send_note: true,
  message: true,
};

export function parsePermissions(raw: unknown): PortalPermissions {
  const fallback = { ...FULL_PERMISSIONS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  // Narrow with an index signature on a locally-typed alias instead of casting
  // `unknown` straight to Record (no trust in the stored JSON).
  const obj: { [K in keyof PortalPermissions]?: unknown } = raw as Partial<PortalPermissions>;
  return {
    view_plans: obj.view_plans !== false,
    send_weight: obj.send_weight !== false,
    send_note: obj.send_note !== false,
    message: obj.message !== false,
  };
}

export function hasPermission(perms: PortalPermissions, key: (typeof PORTAL_PERMISSIONS)[number]): boolean {
  return perms[key] === true;
}

export function permissionKeys(): Array<(typeof PORTAL_PERMISSIONS)[number]> {
  return [...PORTAL_PERMISSIONS];
}

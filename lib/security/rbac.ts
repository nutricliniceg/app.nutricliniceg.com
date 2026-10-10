export type Role = 'doctor' | 'admin' | 'super_admin';

export const PERMISSIONS = {
  MANAGE_OWN_DATA: 'MANAGE_OWN_DATA',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_SUBSCRIPTIONS: 'MANAGE_SUBSCRIPTIONS',
  MANAGE_CMS: 'MANAGE_CMS',
  ACCESS_AUDIT_LOG: 'ACCESS_AUDIT_LOG',
  MANAGE_SYSTEM_SETTINGS: 'MANAGE_SYSTEM_SETTINGS',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const RBAC_MATRIX: Record<Role, Permission[]> = {
  doctor: [PERMISSIONS.MANAGE_OWN_DATA],
  admin: [
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_SUBSCRIPTIONS,
    PERMISSIONS.MANAGE_CMS,
  ],
  super_admin: [
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_SUBSCRIPTIONS,
    PERMISSIONS.MANAGE_CMS,
    PERMISSIONS.ACCESS_AUDIT_LOG,
    PERMISSIONS.MANAGE_SYSTEM_SETTINGS,
    PERMISSIONS.MANAGE_OWN_DATA,
  ],
};

export const hasPermission = (role: Role, permission: Permission): boolean => {
  return RBAC_MATRIX[role].includes(permission);
};

/**
 * True when the role may reach an /api/admin surface at all.
 * Admin routes answer 404 (not 403) for non-admins so that route existence is
 * not enumerable (hard invariant #1).
 */
export const isAdminRole = (role: string): boolean => role === 'admin' || role === 'super_admin';

/** True when the role may reach super-admin-only surfaces (pricing, settings, audit). */
export const isSuperRole = (role: string): boolean => role === 'super_admin';

/** True for any signed-in staff role (doctor or above). */
export const isStaffRole = (role: string): boolean => role === 'doctor' || isAdminRole(role);

/** True only for the doctor role (used by doctor-scoped submit endpoints). */
export const isDoctorRole = (role: string): boolean => role === 'doctor';
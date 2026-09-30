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
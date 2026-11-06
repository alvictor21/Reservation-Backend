const permissions = {
  admin: ["create", "read", "update", "delete", "audit"],
  user: ["create", "read"],
};

export const ACTIONS = ["create", "read", "update", "delete", "audit"];

export function hasPermission(role, action) {
  return permissions[role]?.includes(action) ?? false;
}

export function getPermissionMap(role) {
  return Object.fromEntries(ACTIONS.map((a) => [a, hasPermission(role, a)]));
}
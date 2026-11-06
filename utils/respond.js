import { ACTIONS, getPermissionMap, hasPermission } from "../permissions.js";

function maskBody(body) {
  if (!body || typeof body !== "object") return body ?? null;
  const copy = { ...body };
  if ("password" in copy) copy.password = "***";
  return copy;
}

function describeRole(role) {
  const allowed = ACTIONS.filter((a) => hasPermission(role, a));
  const denied = ACTIONS.filter((a) => !hasPermission(role, a));
  return (
    `Role "${role}" diizinkan: ${allowed.join(", ")}.` +
    (denied.length ? ` Ditolak: ${denied.join(", ")}.` : "")
  );
}

// Format respons standar untuk SEMUA endpoint
export function respond(
  req,
  res,
  status,
  { message, data = null, requiredAction = null, actor = null, extra = {} }
) {
  const who = actor ?? req.user ?? null;
  const role = who?.role ?? null;

  return res.status(status).json({
    success: status < 400,
    status_code: status,
    message,
    timestamp: new Date().toISOString(),
    request: {
      method: req.method,
      endpoint: req.originalUrl,
      params: req.params ?? {},
      received_data: maskBody(req.body),
    },
    auth: {
      authenticated: Boolean(who),
      user_id: who?.id ?? null,
      username: who?.username ?? null,
      role,
      required_permission: requiredAction,
      permission_granted:
        requiredAction && role ? hasPermission(role, requiredAction) : null,
      role_permissions: role ? getPermissionMap(role) : null,
      role_rules: role ? describeRole(role) : null,
    },
    data,
    ...extra,
  });

}
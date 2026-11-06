import { pool } from "../db.js";

export function clientInfo(req) {
  const label = String(req.headers["x-actor-name"] ?? "").trim().slice(0, 100);
  return {
    ip: req.ip ?? null,
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 255) || null,
    actorLabel: label || null,
  };
}

const toJson = (v) => (v === undefined || v === null ? null : JSON.stringify(v));

/**
 * Tulis satu baris audit log. Kirim `conn` agar ikut dalam transaksi.
 * Mengembalikan { id, occurredAt }.
 */
export async function writeAudit(req, entry, conn = pool) {
  const { ip, userAgent, actorLabel } = clientInfo(req);

  const [ins] = await conn.query(
    `INSERT INTO audit_logs
       (user_id, username, role, actor_label, action, entity, entity_id,
        old_data, new_data, changed_fields, http_method, endpoint,
        ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.userId ?? req.user?.id ?? null,
      entry.username ?? req.user?.username ?? null,
      entry.role ?? req.user?.role ?? null,
      actorLabel,
      entry.action,
      entry.entity ?? "reservation",
      entry.entityId ?? null,
      toJson(entry.oldData),
      toJson(entry.newData),
      toJson(entry.changes),
      req.method,
      req.originalUrl.slice(0, 255),
      ip,
      userAgent,
    ]
  );

  const [rows] = await conn.query(
    `SELECT DATE_FORMAT(occurred_at, '%Y-%m-%d %H:%i:%s.%f') AS occurredAt
       FROM audit_logs WHERE id = ?`,
    [ins.insertId]
  );
  return { id: ins.insertId, occurredAt: rows[0].occurredAt };
}
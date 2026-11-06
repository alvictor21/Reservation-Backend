import { Router } from "express";
import { pool } from "../db.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { respond } from "../utils/respond.js";

const router = Router();

// GET /api/audit-logs?action=DELETE&username=admin_demo&entity_id=5&limit=50
router.get("/", authenticate, authorize("audit"), async (req, res) => {
  const where = [];
  const params = [];

  const filters = {
    action: "action",
    username: "username",
    entity_id: "entity_id",
    actor_label: "actor_label",
    ip: "ip_address",
  };
  for (const [query, column] of Object.entries(filters)) {
    if (req.query[query]) {
      where.push(`${column} = ?`);
      params.push(req.query[query]);
    }
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

  const [rows] = await pool.query(
    `SELECT id,
            DATE_FORMAT(occurred_at, '%Y-%m-%d %H:%i:%s.%f') AS occurredAt,
            user_id AS userId, username, role, actor_label AS actorLabel,
            action, entity, entity_id AS entityId,
            old_data AS oldData, new_data AS newData, changed_fields AS changes,
            http_method AS method, endpoint, ip_address AS ip,
            user_agent AS userAgent
       FROM audit_logs
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY id DESC
      LIMIT ?`,
    [...params, limit]
  );

  respond(req, res, 200, {
    message: `Menampilkan ${rows.length} catatan audit (terbaru dulu).`,
    requiredAction: "audit",
    data: rows,
  });
});

export default router;
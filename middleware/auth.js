import jwt from "jsonwebtoken";
import { hasPermission } from "../permissions.js";
import { respond } from "../utils/respond.js";
import { writeAudit } from "../utils/audit.js";

export function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");

  if (scheme !== "Bearer" || !token) {
    return respond(req, res, 401, {
      message: "Token tidak ditemukan. Kirim header Authorization: Bearer <token>.",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, username: payload.username, role: payload.role };
    next();
  } catch {
    return respond(req, res, 401, {
      message: "Token tidak valid atau sudah kedaluwarsa.",
    });
  }
}

export const authorize = (action) => async (req, res, next) => {
  if (hasPermission(req.user.role, action)) return next();

  // Percobaan akses terlarang ikut dicatat
  try {
    await writeAudit(req, {
      action: "ACCESS_DENIED",
      entity: "api",
      newData: { required_permission: action, received_data: req.body ?? null },
    });
  } catch (err) {
    console.error("Gagal menulis audit log:", err.message);
  }

  return respond(req, res, 403, {
    message: `Akses ditolak: role "${req.user.role}" tidak memiliki izin ${action}.`,
    requiredAction: action,
  });
};
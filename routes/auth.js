import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { authenticate } from "../middleware/auth.js";
import { respond } from "../utils/respond.js";
import { writeAudit } from "../utils/audit.js";

const router = Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return respond(req, res, 400, { message: "Username dan password wajib diisi." });
  }

  const [rows] = await pool.query(
    "SELECT id, username, password_hash, role FROM users WHERE username = ?",
    [String(username).trim()]
  );
  const user = rows[0];

  // Password tidak pernah dicatat, hanya username yang dicoba
  const failed = (reason) =>
    writeAudit(req, {
      action: "LOGIN_FAILED",
      entity: "auth",
      username: String(username).trim().slice(0, 50),
      newData: { reason },
    });

  if (!user) {
    await failed("username tidak terdaftar");
    return respond(req, res, 401, { message: "Username tidak terdaftar." });
  }

  const match = await bcrypt.compare(String(password), user.password_hash);
  if (!match) {
    await failed("password salah");
    return respond(req, res, 401, { message: "Password salah. Silakan coba lagi." });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

  const log = await writeAudit(req, {
    action: "LOGIN_SUCCESS",
    entity: "auth",
    entityId: user.id,
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  return respond(req, res, 200, {
    message: `Login berhasil sebagai ${user.role}.`,
    actor: { id: user.id, username: user.username, role: user.role },
    data: { user: { username: user.username, role: user.role }, token },
    extra: { audit: log },
  });
});

// GET /api/auth/me
router.get("/me", authenticate, (req, res) =>
  respond(req, res, 200, {
    message: "Token valid.",
    data: { user: { username: req.user.username, role: req.user.role } },
  })
);

export default router;
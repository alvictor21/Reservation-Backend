import { Router } from "express";
import { pool, withTransaction } from "../db.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { respond } from "../utils/respond.js";
import { writeAudit, clientInfo } from "../utils/audit.js";

const router = Router();

const STATUSES = ["Pending", "Approved", "Rejected"];
const TRACKED_FIELDS = [
  "borrower", "room", "date", "startTime", "endTime", "purpose", "status",
];

const SELECT_COLUMNS = `
  id, borrower, room,
  DATE_FORMAT(reservation_date, '%Y-%m-%d') AS date,
  TIME_FORMAT(start_time, '%H:%i') AS startTime,
  TIME_FORMAT(end_time, '%H:%i') AS endTime,
  purpose, status,
  created_by AS createdBy, created_by_label AS createdByLabel,
  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS createdAt,
  updated_by AS updatedBy, updated_by_label AS updatedByLabel,
  DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s.%f') AS updatedAt,
  last_modified_ip AS lastModifiedIp`;

async function findById(id, conn = pool, lock = false) {
  const [rows] = await conn.query(
    `SELECT ${SELECT_COLUMNS} FROM reservations WHERE id = ?${lock ? " FOR UPDATE" : ""}`,
    [id]
  );
  return rows[0] ?? null;
}

function diff(oldRow, newRow) {
  const changes = {};
  for (const k of TRACKED_FIELDS) {
    if (oldRow[k] !== newRow[k]) changes[k] = { from: oldRow[k], to: newRow[k] };
  }
  return changes;
}

// Validasi sisi server. Status default "Pending" jika tidak dikirim.
function validate(body = {}) {
  const v = {
    borrower: String(body.borrower ?? "").trim(),
    room: String(body.room ?? "").trim(),
    date: String(body.date ?? ""),
    startTime: String(body.startTime ?? ""),
    endTime: String(body.endTime ?? ""),
    purpose: String(body.purpose ?? "").trim(),
    status: String(body.status ?? "Pending"),
  };

  const missing = Object.keys(v).filter((k) => !v[k]);
  if (missing.length) {
    return { error: `Field wajib diisi: ${missing.join(", ")}.` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) {
    return { error: "Format tanggal tidak valid (YYYY-MM-DD)." };
  }
  if (!/^\d{2}:\d{2}$/.test(v.startTime) || !/^\d{2}:\d{2}$/.test(v.endTime)) {
    return { error: "Format jam tidak valid (HH:MM)." };
  }
  if (v.endTime <= v.startTime) {
    return { error: "Jam selesai harus lebih besar dari jam mulai." };
  }
  if (!STATUSES.includes(v.status)) {
    return { error: `Status tidak valid. Pilihan: ${STATUSES.join(", ")}.` };
  }
  return { values: v };
}

// ---------- READ ----------
router.get("/", authenticate, authorize("read"), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM reservations ORDER BY id ASC`
  );
  respond(req, res, 200, {
    message: `Berhasil membaca ${rows.length} data peminjaman.`,
    requiredAction: "read",
    data: rows,
  });
});

// ---------- CREATE ----------
router.post("/", authenticate, authorize("create"), async (req, res) => {
  const { error, values } = validate(req.body);
  if (error) {
    return respond(req, res, 400, { message: error, requiredAction: "create" });
  }

  const isAdmin = req.user.role === "admin";
  const finalStatus = isAdmin ? values.status : "Pending";
  const statusForced = finalStatus !== values.status;
  const { actorLabel, ip } = clientInfo(req);

  const { created, log } = await withTransaction(async (conn) => {
    const [ins] = await conn.query(
      `INSERT INTO reservations
         (borrower, room, reservation_date, start_time, end_time, purpose, status,
          created_by, created_by_label, last_modified_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        values.borrower, values.room, values.date,
        values.startTime, values.endTime, values.purpose, finalStatus,
        req.user.id, actorLabel, ip,
      ]
    );
    const row = await findById(ins.insertId, conn);
    const entry = await writeAudit(
      req,
      { action: "CREATE", entityId: ins.insertId, newData: row },
      conn
    );
    return { created: row, log: entry };
  });

  respond(req, res, 201, {
    message: statusForced
      ? `Data ditambahkan. Status diubah paksa menjadi Pending karena role "${req.user.role}" tidak boleh menentukan status.`
      : "Data peminjaman berhasil ditambahkan.",
    requiredAction: "create",
    data: created,
    extra: { status_forced_to_pending: statusForced, audit: log },
  });
});

// ---------- UPDATE ----------
router.put("/:id", authenticate, authorize("update"), async (req, res) => {
  const { error, values } = validate(req.body);
  if (error) {
    return respond(req, res, 400, { message: error, requiredAction: "update" });
  }
  const { actorLabel, ip } = clientInfo(req);

  const result = await withTransaction(async (conn) => {
    const old = await findById(req.params.id, conn, true);
    if (!old) return null;

    await conn.query(
      `UPDATE reservations
          SET borrower = ?, room = ?, reservation_date = ?,
              start_time = ?, end_time = ?, purpose = ?, status = ?,
              updated_by = ?, updated_by_label = ?, last_modified_ip = ?
        WHERE id = ?`,
      [
        values.borrower, values.room, values.date,
        values.startTime, values.endTime, values.purpose, values.status,
        req.user.id, actorLabel, ip, req.params.id,
      ]
    );

    const updated = await findById(req.params.id, conn);
    const changes = diff(old, updated);
    const log = await writeAudit(
      req,
      {
        action: "UPDATE",
        entityId: old.id,
        oldData: old,
        newData: updated,
        changes,
      },
      conn
    );
    return { updated, changes, log };
  });

  if (!result) {
    return respond(req, res, 404, {
      message: "Data peminjaman tidak ditemukan.",
      requiredAction: "update",
    });
  }

  respond(req, res, 200, {
    message: Object.keys(result.changes).length
      ? "Data peminjaman berhasil diubah."
      : "Request diproses, tetapi tidak ada nilai yang berubah.",
    requiredAction: "update",
    data: result.updated,
    extra: { changes: result.changes, audit: result.log },
  });
});

// ---------- DELETE ----------
router.delete("/:id", authenticate, authorize("delete"), async (req, res) => {
  const result = await withTransaction(async (conn) => {
    const old = await findById(req.params.id, conn, true);
    if (!old) return null;

    await conn.query("DELETE FROM reservations WHERE id = ?", [req.params.id]);
    const log = await writeAudit(
      req,
      { action: "DELETE", entityId: old.id, oldData: old },
      conn
    );
    return { old, log };
  });

  if (!result) {
    return respond(req, res, 404, {
      message: "Data peminjaman tidak ditemukan.",
      requiredAction: "delete",
    });
  }

  respond(req, res, 200, {
    message: "Data peminjaman berhasil dihapus.",
    requiredAction: "delete",
    data: { deleted: result.old },
    extra: { audit: result.log },
  });
});

export default router;
import { pool } from "./db.js";
import bcrypt from "bcryptjs";

const accounts = [
  { username: "admin_demo", password: "admin123", role: "admin" },
  { username: "user_demo", password: "user123", role: "user" },
];

for (const acc of accounts) {
  const hash = await bcrypt.hash(acc.password, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role)`,
    [acc.username, hash, acc.role]
  );
  console.log(`Akun ${acc.username} (${acc.role}) siap.`);
}

await pool.end();
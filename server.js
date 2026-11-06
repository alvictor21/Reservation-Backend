import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import reservationRoutes from "./routes/reservations.js";
import auditRoutes from "./routes/audit.js";
import { respond } from "./utils/respond.js";

const app = express();

app.set("json spaces", 2); // JSON rapi di Postman
app.use(cors({ origin: process.env.CLIENT_ORIGIN }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/audit-logs", auditRoutes);

app.use((req, res) =>
  respond(req, res, 404, { message: "Endpoint tidak ditemukan." })
);

app.use((err, req, res, next) => {
  console.error(err);
  // Body JSON rusak dari klien
  if (err.type === "entity.parse.failed") {
    return respond(req, res, 400, { message: "Body bukan JSON yang valid." });
  }
  respond(req, res, 500, { message: "Terjadi kesalahan pada server." });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`API berjalan di http://localhost:${port}`);
});
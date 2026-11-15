import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import authRouter from "./routes/auth";
import notesRouter from "./routes/notes";
import tutorRouter from "./routes/tutor";
import collectionsRouter from "./routes/collections";
import assignmentsRouter from "./routes/assignments";
import attendanceRouter from "./routes/attendance";
import gradesRouter from "./routes/grades";
import profileRouter from "./routes/profile";
import timetableRouter from "./routes/timetable";
import examsRouter from "./routes/exams";
import syllabusRouter from "./routes/syllabus";
import studySessionsRouter from "./routes/studySessions";
import pyqRouter from "./routes/pyq";
import subjectAssignmentsRouter from "./routes/subjectAssignments";
import adminRouter from "./routes/admin";
import { validateJwtConfig } from "./utils/jwtConfig";

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  const healthy = mongoose.connection.readyState === 1;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "db_unavailable",
    database: healthy ? "connected" : "disconnected",
    readyState: mongoose.connection.readyState,
  });
});

app.use("/api/auth", authRouter);
app.use("/api/notes", notesRouter);
app.use("/api/tutor", tutorRouter);
app.use("/api/collections", collectionsRouter);
app.use("/api/assignments", assignmentsRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/grades", gradesRouter);
app.use("/api/profile", profileRouter);
app.use("/api/timetable", timetableRouter);
app.use("/api/exams", examsRouter);
app.use("/api/syllabus", syllabusRouter);
app.use("/api/study-sessions", studySessionsRouter);
app.use("/api/pyq", pyqRouter);
app.use("/api/subject-assignments", subjectAssignmentsRouter);
app.use("/api/admin", adminRouter);

// Global error handler — must be after all routes
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  console.error("Global error:", err.message);
  res.status(400).json({ message: err.message || "Unknown error" });
});

const PORT = process.env.PORT || 5000;

const startServer = async (): Promise<void> => {
  try {
    validateJwtConfig();
  } catch {
    console.error("Server startup aborted because JWT configuration is invalid.");
    process.exit(1);
    return;
  }

  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch {
    console.error("Server startup aborted because MongoDB connection failed.");
    process.exit(1);
    return;
  }
};

startServer();

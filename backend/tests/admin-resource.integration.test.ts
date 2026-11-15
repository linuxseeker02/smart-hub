import cookieParser from "cookie-parser";
import express from "express";
import http from "node:http";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import adminRouter from "../src/routes/admin";
import { createSessionAccessToken } from "../src/utils/sessionTokens";
import User from "../src/models/User";
import AuthSession from "../src/models/AuthSession";
import Note from "../src/models/Note";
import PYQ from "../src/models/PYQ";
import AuditEvent from "../src/models/AuditEvent";

const database = "smart_hub_provisioning_test";
const uri =
  "mongodb://127.0.0.1:27018/smart_hub_provisioning_test?replicaSet=rs0&directConnection=true";
let server: http.Server;
let baseUrl: string;

const createUser = (suffix: string, role: "student" | "admin" = "student") =>
  User.create({
    name: `Resource ${suffix}`,
    email: `${suffix}@resource.test`,
    passwordHash: "integration-only-hash",
    role,
    isActive: true,
  });

const createSession = async (
  userId: mongoose.Types.ObjectId,
  suffix: string
): Promise<string> => {
  const sessionId = `resource-session-${suffix}`;
  await AuthSession.create({
    userId,
    sessionId,
    familyId: `resource-family-${suffix}`,
    currentTokenHash: `resource-hash-${suffix}`,
    currentTokenIssuedAt: new Date(),
    currentTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    lastUsedAt: new Date(),
    revokedAt: null,
  });
  return createSessionAccessToken(userId.toString(), sessionId);
};

const createNote = async (
  userId: mongoose.Types.ObjectId,
  status: "pending" | "approved" | "rejected" | "removed" = "pending"
) =>
  Note.create({
    uploadedBy: userId,
    fileUrl: "https://example.test/note.pdf",
    filePublicId: `note-${new mongoose.Types.ObjectId()}`,
    deliveryMode: "authenticated",
    deliveryResourceType: "image",
    fileType: "pdf",
    originalName: "note.pdf",
    title: `Resource note ${status}`,
    summary: "summary",
    semester: 1,
    subject: "Math",
    topic: "Algebra",
    moderationStatus: status,
  });

const createPyq = async (userId: mongoose.Types.ObjectId) =>
  PYQ.create({
    uploadedBy: userId,
    semester: 1,
    courseCode: "MATH101",
    courseName: "Mathematics",
    year: 2026,
    examType: "End Semester",
    fileUrl: "https://example.test/pyq.pdf",
    filePublicId: `pyq-${new mongoose.Types.ObjectId()}`,
    deliveryMode: "authenticated",
    deliveryResourceType: "image",
    originalName: "pyq.pdf",
    description: "past paper",
    moderationStatus: "pending",
  });

const request = async (path: string, token?: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  if (token) headers.set("Cookie", `token=${token}`);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
};

beforeAll(async () => {
  process.env.GROQ_API_KEY = "test-only-groq-key";
  process.env.JWT_SECRET = "access-7f3c9a1d4e8b2c6f0a5d3e7b1c9f4a8d";
  process.env.JWT_REFRESH_SECRET = "refresh-2c8e6a1f4d9b7e3a5c0f2d6b8a1e4c7f";
  const parsed = new URL(uri);
  if (
    parsed.hostname !== "127.0.0.1" ||
    parsed.pathname !== `/${database}` ||
    parsed.searchParams.get("replicaSet") !== "rs0"
  ) {
    throw new Error("Resource tests require the dedicated disposable database.");
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (mongoose.connection.name !== database || hello.setName !== "rs0") {
    throw new Error("Resource tests require the disposable replica set.");
  }
  const app = express();
  const [{ default: notesRouter }, { default: pyqRouter }] = await Promise.all([
    import("../src/routes/notes"),
    import("../src/routes/pyq"),
  ]);
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/admin", adminRouter);
  app.use("/api/notes", notesRouter);
  app.use("/api/pyq", pyqRouter);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP server failed.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    AuthSession.deleteMany({}),
    Note.deleteMany({}),
    PYQ.deleteMany({}),
    AuditEvent.deleteMany({}),
  ]);
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  await mongoose.disconnect();
});

describe("admin resource moderation", () => {
  it("enforces admin authorization and validates resource IDs", async () => {
    const admin = await createUser("admin", "admin");
    const student = await createUser("student");
    const adminToken = await createSession(admin._id, "admin");
    const studentToken = await createSession(student._id, "student");

    expect((await request("/api/admin/notes")).status).toBe(401);
    expect((await request("/api/admin/notes", studentToken)).status).toBe(403);
    expect((await request("/api/admin/notes/not-an-id", adminToken)).status).toBe(400);
    expect(
      (await request(`/api/admin/notes/${new mongoose.Types.ObjectId()}`, adminToken)).status
    ).toBe(404);
  });

  it("keeps catalogues public while protecting document access", async () => {
    const owner = await createUser("public-catalogue-owner");
    const note = await createNote(owner._id, "approved");
    const pyq = await createPyq(owner._id);
    await PYQ.updateOne({ _id: pyq._id }, { $set: { moderationStatus: "approved" } });

    expect((await request("/api/notes")).status).toBe(200);
    expect((await request(`/api/notes/${note._id}`)).status).toBe(200);
    expect((await request("/api/pyq")).status).toBe(200);
    expect((await request(`/api/notes/${note._id}/file-url`)).status).toBe(401);
    expect((await request(`/api/notes/${note._id}/download`)).status).toBe(401);
    expect((await request(`/api/pyq/${pyq._id}/file-url`)).status).toBe(401);
    expect((await request(`/api/pyq/${pyq._id}/download`)).status).toBe(401);
  });

  it("lists, inspects, moderates, and removes notes with history and audit records", async () => {
    const admin = await createUser("note-admin", "admin");
    const student = await createUser("note-owner");
    const adminToken = await createSession(admin._id, "note-admin");
    const note = await createNote(student._id);

    expect((await request("/api/admin/notes?status=pending", adminToken)).status).toBe(200);
    expect((await request(`/api/admin/notes/${note._id}`, adminToken)).status).toBe(200);

    const approve = await request(`/api/admin/notes/${note._id}/moderation`, adminToken, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(approve.status).toBe(200);
    expect((await Note.findById(note._id))?.moderationHistory).toHaveLength(1);

    const remove = await request(`/api/admin/notes/${note._id}`, adminToken, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Policy violation" }),
    });
    expect(remove.status).toBe(200);
    expect((await Note.findById(note._id))?.moderationStatus).toBe("removed");
    expect(await AuditEvent.countDocuments({ targetType: "note" })).toBe(2);
  });

  it("blocks pending, rejected, and removed notes while preserving approved access", async () => {
    const owner = await createUser("visibility-owner");
    const studentToken = await createSession(owner._id, "visibility");
    const pending = await createNote(owner._id, "pending");
    const approved = await createNote(owner._id, "approved");
    const rejected = await createNote(owner._id, "rejected");
    const removed = await createNote(owner._id, "removed");

    for (const id of [pending._id, rejected._id, removed._id]) {
      expect((await request(`/api/notes/${id}`, studentToken)).status).toBe(404);
      expect((await request(`/api/notes/${id}/thumbnail`, studentToken)).status).toBe(404);
    }
    expect((await request(`/api/notes/${approved._id}`, studentToken)).status).toBe(200);
    const listing = await request("/api/notes", studentToken);
    const body = (await listing.json()) as {
      notes: Array<{ _id: string; fileUrl?: string; filePublicId?: string }>;
    };
    expect(body.notes.map((item) => item._id)).toContain(approved._id.toString());
    expect(body.notes.map((item) => item._id)).not.toContain(pending._id.toString());
    expect(body.notes[0]).not.toHaveProperty("fileUrl");
    expect(body.notes[0]).not.toHaveProperty("filePublicId");
  });

  it("preserves legacy notes without moderationStatus in public views", async () => {
    const owner = await createUser("legacy-owner");
    const legacy = new mongoose.Types.ObjectId();
    await Note.collection.insertOne({
      _id: legacy,
      uploadedBy: owner._id,
      fileUrl: "https://example.test/legacy.pdf",
      filePublicId: "legacy-note",
      fileType: "pdf",
      originalName: "legacy.pdf",
      title: "Legacy note",
      summary: "",
      keywords: [],
      quizQuestions: [],
      semester: 1,
      subject: "Math",
      topic: "Legacy",
      ratings: [],
      averageRating: 0,
      reviews: [],
      downloadCount: 0,
      aiProcessed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const token = await createSession(owner._id, "legacy");
    expect((await request(`/api/notes/${legacy}`, token)).status).toBe(200);
  });

  it("moderates PYQs and hides them from student listing until approved", async () => {
    const admin = await createUser("pyq-admin", "admin");
    const student = await createUser("pyq-owner");
    const adminToken = await createSession(admin._id, "pyq-admin");
    const studentToken = await createSession(student._id, "pyq-student");
    const pyq = await createPyq(student._id);

    const before = await request("/api/pyq", studentToken);
    expect(((await before.json()) as { total: number }).total).toBe(0);

    const moderation = await request(`/api/admin/pyqs/${pyq._id}/moderation`, adminToken, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(moderation.status).toBe(200);
    expect((await request("/api/pyq", studentToken)).status).toBe(200);
    expect(await AuditEvent.countDocuments({ targetType: "pyq" })).toBe(1);
  });

  it("rolls back moderation and history when audit persistence fails", async () => {
    const admin = await createUser("rollback-admin", "admin");
    const student = await createUser("rollback-owner");
    const adminToken = await createSession(admin._id, "rollback-admin");
    const note = await createNote(student._id);
    const auditCreate = vi.spyOn(AuditEvent, "create").mockRejectedValue(
      new Error("injected audit failure")
    );

    try {
      const response = await request(`/api/admin/notes/${note._id}/moderation`, adminToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      expect(response.status).toBe(500);
      const finalNote = await Note.findById(note._id);
      expect(finalNote?.moderationStatus).toBe("pending");
      expect(finalNote?.moderationHistory).toHaveLength(0);
      expect(await AuditEvent.countDocuments({ targetId: note._id.toString() })).toBe(0);
    } finally {
      auditCreate.mockRestore();
    }
  });
});

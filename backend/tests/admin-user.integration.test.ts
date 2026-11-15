import express from "express";
import cookieParser from "cookie-parser";
import http from "node:http";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  changeUserRole,
  changeUserStatus,
  getUser,
  listUsers,
  revokeUserSessions,
} from "../src/controllers/adminUserController";
import User from "../src/models/User";
import AuthSession from "../src/models/AuthSession";
import AuditEvent from "../src/models/AuditEvent";
import adminRouter from "../src/routes/admin";
import { createSessionAccessToken } from "../src/utils/sessionTokens";

const TEST_DATABASE = "smart_hub_provisioning_test";
const TEST_URI =
  "mongodb://127.0.0.1:27018/smart_hub_provisioning_test?replicaSet=rs0&directConnection=true";
let server: http.Server;
let baseUrl: string;

const response = () => {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    json: (body: unknown) => {
      res.body = body;
      return res;
    },
  };
  return res;
};

const request = (
  actorId: string,
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
  query: Record<string, string> = {}
) =>
  ({
    user: { id: actorId },
    params,
    body,
    query,
    header: () => undefined,
  }) as never;

const createUser = async (suffix: string, role: "student" | "admin" = "student") =>
  User.create({
    name: `Admin API ${suffix}`,
    email: `${suffix}@admin-api.test`,
    passwordHash: "integration-only-hash",
    role,
    isActive: true,
  });

const createSession = async (userId: mongoose.Types.ObjectId, suffix: string) =>
  AuthSession.create({
    userId,
    sessionId: `admin-api-session-${suffix}`,
    familyId: `admin-api-family-${suffix}`,
    currentTokenHash: `hash-${suffix}`,
    currentTokenIssuedAt: new Date(),
    currentTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    lastUsedAt: new Date(),
    revokedAt: null,
  });

const createHttpSession = async (
  userId: mongoose.Types.ObjectId,
  sessionId: string,
  suffix: string
) => {
  await AuthSession.create({
    userId,
    sessionId,
    familyId: `admin-http-family-${suffix}`,
    currentTokenHash: `hash-http-${suffix}`,
    currentTokenIssuedAt: new Date(),
    currentTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    lastUsedAt: new Date(),
    revokedAt: null,
  });
  return createSessionAccessToken(userId.toString(), sessionId);
};

const httpRequest = async (path: string, token?: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  if (token) headers.set("Cookie", `token=${token}`);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
};

beforeAll(async () => {
  process.env.JWT_SECRET =
    "access-7f3c9a1d4e8b2c6f0a5d3e7b1c9f4a8d";
  process.env.JWT_REFRESH_SECRET =
    "refresh-2c8e6a1f4d9b7e3a5c0f2d6b8a1e4c7f";
  const parsed = new URL(TEST_URI);
  if (
    parsed.hostname !== "127.0.0.1" ||
    parsed.pathname !== `/${TEST_DATABASE}` ||
    parsed.searchParams.get("replicaSet") !== "rs0"
  ) {
    throw new Error("Admin integration tests require the dedicated test URI.");
  }
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (mongoose.connection.name !== TEST_DATABASE || hello.setName !== "rs0") {
    throw new Error("Admin integration tests require the disposable replica set.");
  }

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/admin", adminRouter);
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP test server failed.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    AuthSession.deleteMany({}),
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

describe("admin user management integration", () => {
  it("enforces authorization through the mounted Express admin router", async () => {
    const admin = await createUser("http-admin", "admin");
    const student = await createUser("http-student");
    const adminToken = await createHttpSession(admin._id, "http-admin-session", "admin");
    const studentToken = await createHttpSession(
      student._id,
      "http-student-session",
      "student"
    );

    expect((await httpRequest("/api/admin/users")).status).toBe(401);
    expect((await httpRequest("/api/admin/users", studentToken)).status).toBe(403);
    expect((await httpRequest("/api/admin/users", adminToken)).status).toBe(200);
    expect((await httpRequest("/api/admin/users/not-an-id", adminToken)).status).toBe(400);
    expect(
      (await httpRequest(
        `/api/admin/users/${new mongoose.Types.ObjectId().toString()}`,
        adminToken
      )).status
    ).toBe(404);
  });

  it("lists/searches users with safe fields and returns details", async () => {
    const admin = await createUser("admin", "admin");
    const student = await createUser("student");

    const listResponse = response();
    await listUsers(
      request(admin._id.toString(), {}, {}, {
        search: "student",
        role: "student",
        isActive: "true",
        page: "1",
        limit: "10",
      }),
      listResponse as never
    );

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body).toMatchObject({
      total: 1,
      users: [
        {
          _id: student._id,
          email: student.email,
          role: "student",
          isActive: true,
        },
      ],
    });
    expect(JSON.stringify(listResponse.body)).not.toContain("passwordHash");

    const detailResponse = response();
    await getUser(
      request(admin._id.toString(), { id: student._id.toString() }),
      detailResponse as never
    );
    expect(detailResponse.statusCode).toBe(200);
    expect(JSON.stringify(detailResponse.body)).not.toContain("passwordHash");
    expect(await AuditEvent.countDocuments({ action: "user_viewed" })).toBe(1);
  });

  it("promotes a user, revokes sessions, and writes an audit event", async () => {
    const admin = await createUser("role-admin", "admin");
    const student = await createUser("role-target");
    await createSession(student._id, "role");

    const res = response();
    await changeUserRole(
      request(
        admin._id.toString(),
        { id: student._id.toString() },
        { role: "admin" }
      ),
      res as never
    );

    expect(res.statusCode).toBe(200);
    expect((await User.findById(student._id))?.role).toBe("admin");
    expect((await AuthSession.findOne({ userId: student._id }))?.revokedReason).toBe(
      "role_changed"
    );
    expect(await AuditEvent.countDocuments({ action: "user_role_changed" })).toBe(1);
  });

  it("prevents self-demotion and demotion of the last active admin", async () => {
    const admin = await createUser("only-admin", "admin");

    const selfResponse = response();
    await changeUserRole(
      request(
        admin._id.toString(),
        { id: admin._id.toString() },
        { role: "student" }
      ),
      selfResponse as never
    );
    expect(selfResponse.statusCode).toBe(400);

    const other = await createUser("second-admin", "admin");
    const firstChange = response();
    const secondChange = response();
    await Promise.all([
      changeUserRole(
        request(
          admin._id.toString(),
          { id: admin._id.toString() },
          { role: "student" }
        ),
        firstChange as never
      ),
      changeUserRole(
        request(
          admin._id.toString(),
          { id: other._id.toString() },
          { role: "student" }
        ),
        secondChange as never
      ),
    ]);

    expect(await User.countDocuments({ role: "admin", isActive: true })).toBe(1);
  });

  it("disables accounts, revokes sessions, and prevents self-disable", async () => {
    const admin = await createUser("status-admin", "admin");
    const student = await createUser("status-target");
    await createSession(student._id, "status");

    const disableResponse = response();
    await changeUserStatus(
      request(
        admin._id.toString(),
        { id: student._id.toString() },
        { isActive: false }
      ),
      disableResponse as never
    );
    expect(disableResponse.statusCode).toBe(200);
    expect((await User.findById(student._id))?.isActive).toBe(false);
    expect((await AuthSession.findOne({ userId: student._id }))?.revokedReason).toBe(
      "account_disabled"
    );
    expect(await AuditEvent.countDocuments({ action: "user_status_changed" })).toBe(1);

    const selfResponse = response();
    await changeUserStatus(
      request(
        admin._id.toString(),
        { id: admin._id.toString() },
        { isActive: false }
      ),
      selfResponse as never
    );
    expect(selfResponse.statusCode).toBe(400);
  });

  it("revokes all active sessions and returns only a count", async () => {
    const admin = await createUser("revoke-admin", "admin");
    const student = await createUser("revoke-target");
    await createSession(student._id, "one");
    await createSession(student._id, "two");
    await AuthSession.updateOne(
      { sessionId: "admin-api-session-two" },
      { $set: { revokedAt: new Date(), revokedReason: "logout" } }
    );

    const res = response();
    await revokeUserSessions(
      request(admin._id.toString(), { id: student._id.toString() }),
      res as never
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ revokedCount: 1 });
    expect(JSON.stringify(res.body)).not.toContain("sessionId");
    expect(await AuditEvent.countDocuments({ action: "user_sessions_revoked" })).toBe(1);
  });

  it("rolls back role and session changes when audit persistence fails", async () => {
    const admin = await createUser("audit-failure-admin", "admin");
    const student = await createUser("audit-failure-target");
    await createSession(student._id, "audit-failure");
    const auditCreate = vi.spyOn(AuditEvent, "create").mockRejectedValue(
      new Error("injected audit persistence failure")
    );

    try {
      const res = response();
      await changeUserRole(
        request(
          admin._id.toString(),
          { id: student._id.toString() },
          { role: "admin" }
        ),
        res as never
      );

      expect(res.statusCode).toBe(500);
      expect((await User.findById(student._id))?.role).toBe("student");
      expect((await AuthSession.findOne({ userId: student._id }))?.revokedAt).toBeNull();
      expect(await AuditEvent.countDocuments({ targetId: student._id.toString() })).toBe(0);
    } finally {
      auditCreate.mockRestore();
    }
  });
});

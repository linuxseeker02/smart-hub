import mongoose, { ClientSession } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ProvisioningDependencies,
  ProvisioningTarget,
  provisionFirstAdmin,
} from "../src/scripts/provisionAdmin";
import User from "../src/models/User";
import AuthSession from "../src/models/AuthSession";
import AdminProvisioningLock from "../src/models/AdminProvisioningLock";

const DEFAULT_TEST_URI =
  "mongodb://127.0.0.1:27018/smart_hub_provisioning_test?replicaSet=rs0&directConnection=true";
const TEST_DATABASE = "smart_hub_provisioning_test";

const getValidatedTestUri = (): string => {
  const uri = process.env.PROVISIONING_TEST_MONGO_URI ?? DEFAULT_TEST_URI;
  const parsed = new URL(uri);

  if (
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    parsed.port !== "27018" ||
    parsed.pathname !== `/${TEST_DATABASE}` ||
    parsed.searchParams.get("replicaSet") !== "rs0" ||
    parsed.searchParams.get("directConnection") !== "true"
  ) {
    throw new Error(
      "Integration tests require the dedicated loopback smart_hub_provisioning_test replica-set URI."
    );
  }

  return uri;
};

const runTransaction = async <T>(
  operation: (session: ClientSession) => Promise<T>
): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const makeDependencies = (
  sessionUpdateMany = AuthSession.updateMany.bind(AuthSession)
): ProvisioningDependencies => ({
  userModel: User,
  authSessionModel: { updateMany: sessionUpdateMany },
  lockModel: AdminProvisioningLock,
  runTransaction,
});

const createStudent = async (
  suffix: string
): Promise<ProvisioningTarget> => {
  const user = await User.create({
    name: `Integration Student ${suffix}`,
    email: `student-${suffix}@integration.test`,
    passwordHash: "integration-only-hash",
    role: "student",
  });

  return {
    id: user._id,
    name: user.name,
    email: user.email,
  };
};

const createSession = async (target: ProvisioningTarget) =>
  AuthSession.create({
    userId: target.id,
    sessionId: `session-${String(target.id)}`,
    familyId: `family-${String(target.id)}`,
    currentTokenHash: `hash-${String(target.id)}`,
    currentTokenIssuedAt: new Date(),
    currentTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    lastUsedAt: new Date(),
    revokedAt: null,
  });

beforeAll(async () => {
  const uri = getValidatedTestUri();
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  if (mongoose.connection.name !== TEST_DATABASE) {
    throw new Error("Connected database is not the dedicated integration database.");
  }

  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (hello.setName !== "rs0") {
    throw new Error("Integration MongoDB must report replica set rs0.");
  }
});

afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    await Promise.all([
      User.deleteMany({}),
      AuthSession.deleteMany({}),
      AdminProvisioningLock.deleteMany({}),
    ]);
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

describe("first-admin provisioning MongoDB integration", () => {
  it("promotes the confirmed student and revokes active sessions", async () => {
    const target = await createStudent("success");
    await createSession(target);

    await provisionFirstAdmin(target, true, makeDependencies());

    await expect(User.findById(target.id).select("role")).resolves.toMatchObject({
      role: "admin",
    });
    await expect(
      AuthSession.findOne({ userId: target.id }).select("revokedAt revokedReason")
    ).resolves.toMatchObject({ revokedReason: "role_changed" });
    await expect(
      AdminProvisioningLock.countDocuments({ _id: "first-admin" })
    ).resolves.toBe(1);
  });

  it("rejects a second provisioning attempt", async () => {
    const first = await createStudent("first");
    const second = await createStudent("second");

    await provisionFirstAdmin(first, true, makeDependencies());

    await expect(
      provisionFirstAdmin(second, true, makeDependencies())
    ).rejects.toMatchObject({ code: "ALREADY_INITIALIZED" });
    await expect(User.findById(second.id).select("role")).resolves.toMatchObject({
      role: "student",
    });
  });

  it("allows only one concurrent provisioning attempt to succeed", async () => {
    const first = await createStudent("concurrent-first");
    const second = await createStudent("concurrent-second");

    const results = await Promise.allSettled([
      provisionFirstAdmin(first, true, makeDependencies()),
      provisionFirstAdmin(second, true, makeDependencies()),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<{ name: string; email: string }> =>
        result.status === "fulfilled"
    );

    expect(fulfilled).toHaveLength(1);
    const winnerEmail = fulfilled[0].value.email;
    const loser = winnerEmail === first.email ? second : first;

    await expect(User.countDocuments({ role: "admin" })).resolves.toBe(1);
    await expect(User.countDocuments({ role: "student" })).resolves.toBe(1);
    await expect(User.findOne({ email: winnerEmail }).select("role")).resolves.toMatchObject({
      role: "admin",
    });
    await expect(User.findOne({ email: loser.email }).select("role")).resolves.toMatchObject({
      role: "student",
    });
    await expect(
      AdminProvisioningLock.countDocuments({ _id: "first-admin" })
    ).resolves.toBe(1);
  });

  it("rolls back the lock and role when session revocation fails", async () => {
    const target = await createStudent("revocation-failure");
    const activeSession = await createSession(target);
    const failingAuthSessions = {
      updateMany: async () => {
        throw new Error("injected revocation failure");
      },
    };

    await expect(
      provisionFirstAdmin(
        target,
        true,
        makeDependencies(failingAuthSessions.updateMany)
      )
    ).rejects.toThrow("injected revocation failure");

    await expect(User.findById(target.id).select("role")).resolves.toMatchObject({
      role: "student",
    });
    await expect(
      AdminProvisioningLock.countDocuments({ _id: "first-admin" })
    ).resolves.toBe(0);
    await expect(User.exists({ _id: target.id })).resolves.not.toBeNull();
    await expect(
      AuthSession.findById(activeSession._id).select("revokedAt revokedReason")
    ).resolves.toMatchObject({ revokedAt: null });
  });

  it.each([
    ["changed email", async (target: ProvisioningTarget) => {
      await User.updateOne(
        { _id: target.id },
        { $set: { email: "changed@example.test" } }
      );
    }],
    ["deleted account", async (target: ProvisioningTarget) => {
      await User.deleteOne({ _id: target.id });
    }],
    ["changed role", async (target: ProvisioningTarget) => {
      await User.updateOne({ _id: target.id }, { $set: { role: "admin" } });
    }],
  ])("rejects a %s after confirmation", async (_label, changeTarget) => {
    const target = await createStudent(_label.replace(/\s+/g, "-"));
    await createSession(target);
    await changeTarget(target);

    await expect(
      provisionFirstAdmin(target, true, makeDependencies())
    ).rejects.toMatchObject({
      code: _label === "changed role" ? "ADMIN_EXISTS" : "CONCURRENT_CHANGE",
    });
    const finalUser = await User.findById(target.id).select("email role");
    if (_label === "changed email") {
      expect(finalUser).toMatchObject({
        email: "changed@example.test",
        role: "student",
      });
    } else if (_label === "changed role") {
      expect(finalUser).toMatchObject({
        email: target.email,
        role: "admin",
      });
    } else {
      expect(finalUser).toBeNull();
    }
    await expect(
      AdminProvisioningLock.countDocuments({ _id: "first-admin" })
    ).resolves.toBe(0);
    await expect(
      AuthSession.countDocuments({ userId: target.id, revokedAt: { $ne: null } })
    ).resolves.toBe(0);
  });
});

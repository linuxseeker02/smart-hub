import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection } from "mongoose";
import {
  ProvisioningDependencies,
  ProvisioningError,
  ProvisioningTarget,
  provisionFirstAdmin,
  validateEmail,
  verifyProvisioningIdentity,
} from "../src/scripts/provisionAdmin";

const makeDependencies = (): ProvisioningDependencies => ({
  userModel: {
    countDocuments: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
  authSessionModel: {
    updateMany: vi.fn(),
  },
  lockModel: {
    create: vi.fn(),
  },
  runTransaction: vi.fn(async (operation) => operation({} as never)),
});

const student = {
  id: "user-id" as never,
  name: "Student User",
  email: "student@example.test",
} satisfies ProvisioningTarget;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("first administrator provisioning", () => {
  it("normalizes valid email addresses", () => {
    expect(validateEmail("  Student@Example.TEST ")).toBe(
      "student@example.test"
    );
  });

  it.each(["", "invalid", "missing@", "@example.test"])(
    "rejects invalid email input: %s",
    (email) => {
      expect(() => validateEmail(email)).toThrow(ProvisioningError);
    }
  );

  it("rejects missing expected identity configuration", async () => {
    const connection = {
      readyState: 1,
      name: "smart-hub",
      db: {},
    } as unknown as Connection;

    await expect(
      verifyProvisioningIdentity(connection, "", "smart-hub", "development")
    ).rejects.toMatchObject({ code: "IDENTITY_NOT_CONFIGURED" });
  });

  it("rejects a database identity mismatch", async () => {
    const connection = {
      readyState: 1,
      name: "smart-hub-staging",
      db: {
        admin: () => ({
          command: vi.fn().mockResolvedValue({ setName: "rs0" }),
        }),
      },
    } as unknown as Connection;

    await expect(
      verifyProvisioningIdentity(
        connection,
        "staging",
        "smart-hub-production",
        "staging"
      )
    ).rejects.toMatchObject({ code: "DATABASE_IDENTITY_MISMATCH" });
  });

  it("rejects an environment identity mismatch", async () => {
    const connection = {
      readyState: 1,
      name: "smart-hub",
      db: {
        admin: () => ({
          command: vi.fn().mockResolvedValue({ setName: "rs0" }),
        }),
      },
    } as unknown as Connection;

    await expect(
      verifyProvisioningIdentity(
        connection,
        "production",
        "smart-hub",
        "development"
      )
    ).rejects.toMatchObject({ code: "ENVIRONMENT_IDENTITY_MISMATCH" });
  });

  it("accepts a verified replica-set database identity", async () => {
    const connection = {
      readyState: 1,
      name: "smart-hub",
      db: {
        admin: () => ({
          command: vi.fn().mockResolvedValue({ setName: "rs0" }),
        }),
      },
    } as unknown as Connection;

    await expect(
      verifyProvisioningIdentity(
        connection,
        "development",
        "smart-hub",
        "development"
      )
    ).resolves.toEqual({
      environment: "development",
      database: "smart-hub",
      topology: "replica-set",
    });
  });

  it("rejects a standalone MongoDB deployment", async () => {
    const connection = {
      readyState: 1,
      name: "smart-hub",
      db: {
        admin: () => ({
          command: vi.fn().mockResolvedValue({}),
        }),
      },
    } as unknown as Connection;

    await expect(
      verifyProvisioningIdentity(
        connection,
        "development",
        "smart-hub",
        "development"
      )
    ).rejects.toMatchObject({
      code: "TRANSACTION_CAPABILITY_UNAVAILABLE",
    });
  });

  it("rejects operator cancellation before database work", async () => {
    const dependencies = makeDependencies();

    await expect(
      provisionFirstAdmin(student, false, dependencies)
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(dependencies.runTransaction).not.toHaveBeenCalled();
  });

  it("rejects when the confirmed email no longer belongs to the captured account", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.userModel.countDocuments).mockResolvedValue(0);
    vi.mocked(dependencies.userModel.findOneAndUpdate).mockResolvedValue(null);

    await expect(
      provisionFirstAdmin(
        { ...student, email: "changed@example.test" },
        true,
        dependencies
      )
    ).rejects.toMatchObject({ code: "CONCURRENT_CHANGE" });
    expect(dependencies.authSessionModel.updateMany).not.toHaveBeenCalled();
  });

  it("rejects when the captured account was deleted", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.userModel.countDocuments).mockResolvedValue(0);
    vi.mocked(dependencies.userModel.findOneAndUpdate).mockResolvedValue(null);

    await expect(
      provisionFirstAdmin(student, true, dependencies)
    ).rejects.toMatchObject({ code: "CONCURRENT_CHANGE" });
    expect(dependencies.authSessionModel.updateMany).not.toHaveBeenCalled();
  });

  it("rejects when the captured account role changed after confirmation", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.userModel.countDocuments).mockResolvedValue(0);
    vi.mocked(dependencies.userModel.findOneAndUpdate).mockResolvedValue(null);

    await expect(
      provisionFirstAdmin(student, true, dependencies)
    ).rejects.toMatchObject({ code: "CONCURRENT_CHANGE" });
    expect(dependencies.authSessionModel.updateMany).not.toHaveBeenCalled();
  });

  it("promotes exactly the requested student and revokes active sessions", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.userModel.countDocuments).mockResolvedValue(0);
    vi.mocked(dependencies.userModel.findOneAndUpdate).mockResolvedValue({
      ...student,
      role: "admin",
    } as never);
    vi.mocked(dependencies.authSessionModel.updateMany).mockResolvedValue({
      acknowledged: true,
    } as never);

    await expect(
      provisionFirstAdmin(student, true, dependencies)
    ).resolves.toEqual({
      name: student.name,
      email: student.email,
    });

    expect(dependencies.lockModel.create).toHaveBeenCalledWith(
      [{ _id: "first-admin" }],
      { session: expect.anything() }
    );
    expect(dependencies.userModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: student.id, email: student.email, role: "student" },
      { $set: { role: "admin" } },
      { new: true, session: expect.anything() }
    );
    expect(dependencies.authSessionModel.updateMany).toHaveBeenCalledWith(
      { userId: student.id, revokedAt: null },
      {
        $set: {
          revokedAt: expect.any(Date),
          revokedReason: "role_changed",
        },
      },
      { session: expect.anything() }
    );
  });

  it("refuses when another administrator exists", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.userModel.countDocuments).mockResolvedValue(1);

    await expect(
      provisionFirstAdmin(student, true, dependencies)
    ).rejects.toMatchObject({ code: "ADMIN_EXISTS" });
    expect(dependencies.userModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses duplicate or concurrent first-admin execution", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.lockModel.create).mockRejectedValue({ code: 11000 });

    await expect(
      provisionFirstAdmin(student, true, dependencies)
    ).rejects.toMatchObject({ code: "ALREADY_INITIALIZED" });
    expect(dependencies.userModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("fails when the role update does not match the student", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.userModel.countDocuments).mockResolvedValue(0);
    vi.mocked(dependencies.userModel.findOneAndUpdate).mockResolvedValue(null);

    await expect(
      provisionFirstAdmin(student, true, dependencies)
    ).rejects.toMatchObject({ code: "CONCURRENT_CHANGE" });
    expect(dependencies.authSessionModel.updateMany).not.toHaveBeenCalled();
  });

  it("fails when session revocation is not acknowledged", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.userModel.countDocuments).mockResolvedValue(0);
    vi.mocked(dependencies.userModel.findOneAndUpdate).mockResolvedValue(student as never);
    vi.mocked(dependencies.authSessionModel.updateMany).mockResolvedValue({
      acknowledged: false,
    } as never);

    await expect(
      provisionFirstAdmin(student, true, dependencies)
    ).rejects.toMatchObject({ code: "SESSION_REVOCATION_FAILED" });
  });

  it("propagates database failures without reporting success", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.userModel.countDocuments).mockRejectedValue(
      new Error("database unavailable")
    );

    await expect(
      provisionFirstAdmin(student, true, dependencies)
    ).rejects.toThrow("database unavailable");
  });

  it("does not report success when the transaction boundary fails", async () => {
    const dependencies = makeDependencies();
    dependencies.runTransaction = vi.fn().mockRejectedValue(
      new Error("transaction aborted")
    );

    await expect(
      provisionFirstAdmin(student, true, dependencies)
    ).rejects.toThrow("transaction aborted");
    expect(dependencies.userModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does not include sensitive credential data in provisioning results or errors", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.userModel.countDocuments).mockResolvedValue(1);

    await expect(
      provisionFirstAdmin(student, true, dependencies)
    ).rejects.toThrow("An administrator already exists");
    await expect(
      provisionFirstAdmin(student, true, dependencies)
    ).rejects.not.toThrow("secret-hash");
  });
});

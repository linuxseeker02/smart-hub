import mongoose from "mongoose";
import { describe, expect, it, vi } from "vitest";
import {
  AuditServiceError,
  createAuditEvent,
  sanitizeAuditMetadata,
} from "../src/services/auditService";

const actorUserId = new mongoose.Types.ObjectId();

const validInput = {
  actorUserId,
  action: "user_role_changed" as const,
  targetType: "user" as const,
  targetId: new mongoose.Types.ObjectId().toString(),
  outcome: "success" as const,
};

describe("audit service", () => {
  it("creates an event with actor and timestamp", async () => {
    const create = vi.fn().mockImplementation(async (event) => event);
    const before = new Date();

    const event = await createAuditEvent(
      { ...validInput, metadata: { newRole: "admin" } },
      { create }
    );

    expect(create).toHaveBeenCalledOnce();
    expect(event.actorUserId.toString()).toBe(actorUserId.toString());
    expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.metadata).toEqual({ newRole: "admin" });
  });

  it("rejects missing required fields", async () => {
    await expect(
      createAuditEvent({ ...validInput, actorUserId: "" })
    ).rejects.toMatchObject({ code: "MISSING_FIELD" });
    await expect(
      createAuditEvent({ ...validInput, action: "" as never })
    ).rejects.toMatchObject({ code: "MISSING_FIELD" });
  });

  it("rejects invalid actor, action, target, and outcome values", async () => {
    await expect(
      createAuditEvent({ ...validInput, actorUserId: "not-an-id" })
    ).rejects.toMatchObject({ code: "INVALID_FIELD" });
    await expect(
      createAuditEvent({ ...validInput, action: "unknown" as never })
    ).rejects.toMatchObject({ code: "INVALID_FIELD" });
    await expect(
      createAuditEvent({ ...validInput, targetType: "unknown" as never })
    ).rejects.toMatchObject({ code: "INVALID_FIELD" });
    await expect(
      createAuditEvent({ ...validInput, outcome: "unknown" as never })
    ).rejects.toMatchObject({ code: "INVALID_FIELD" });
  });

  it("rejects sensitive metadata and filters unknown fields", () => {
    expect(() =>
      sanitizeAuditMetadata({ password: "secret" })
    ).toThrowError(AuditServiceError);
    expect(sanitizeAuditMetadata({ unrelated: "ignored", reason: "review" })).toEqual({
      reason: "review",
    });
  });

  it("rejects non-scalar metadata", () => {
    expect(() =>
      sanitizeAuditMetadata({ reason: { raw: "body" } })
    ).toThrowError(AuditServiceError);
  });

  it("does not expose database failures or claim persistence", async () => {
    const create = vi.fn().mockRejectedValue(new Error("database credentials"));

    await expect(
      createAuditEvent(validInput, { create })
    ).rejects.toMatchObject({
      code: "PERSISTENCE_FAILED",
      message: "Audit event could not be recorded.",
    });
  });

  it("honors an explicit timestamp", async () => {
    const timestamp = new Date("2026-01-01T00:00:00.000Z");
    const create = vi.fn().mockImplementation(async (event) => event);

    const event = await createAuditEvent(
      { ...validInput, timestamp },
      { create }
    );

    expect(event.timestamp).toEqual(timestamp);
  });
});

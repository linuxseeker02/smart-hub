import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import AuthSession, {
  authSessionSchema,
} from "../src/models/AuthSession";

describe("AuthSession model", () => {
  it("requires session state fields without contacting MongoDB", () => {
    const session = new AuthSession();
    const validationError = session.validateSync();

    expect(validationError).toBeDefined();
    expect(validationError?.errors.userId).toBeDefined();
    expect(validationError?.errors.sessionId).toBeDefined();
    expect(validationError?.errors.familyId).toBeDefined();
    expect(validationError?.errors.currentTokenHash).toBeDefined();
    expect(validationError?.errors.currentTokenIssuedAt).toBeDefined();
    expect(validationError?.errors.currentTokenExpiresAt).toBeDefined();
    expect(validationError?.errors.lastUsedAt).toBeDefined();
  });

  it("defines the session lookup indexes without a TTL index", () => {
    const indexes = authSessionSchema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ userId: 1 }, expect.objectContaining({})],
        [{ familyId: 1 }, expect.objectContaining({})],
        [{ sessionId: 1 }, expect.objectContaining({ unique: true })],
        [
          { userId: 1, revokedAt: 1 },
          expect.objectContaining({}),
        ],
        [
          { familyId: 1, revokedAt: 1 },
          expect.objectContaining({}),
        ],
      ])
    );
    expect(indexes.some(([, options]) => "expireAfterSeconds" in options)).toBe(
      false
    );
  });

  it("does not define a plaintext refresh-token field", () => {
    expect(authSessionSchema.path("currentTokenHash")).toBeDefined();
    expect(authSessionSchema.path("refreshToken")).toBeUndefined();
    expect(authSessionSchema.path("currentToken")).toBeUndefined();
  });

  it("rejects invalid revocation reasons", () => {
    const session = new AuthSession({
      userId: new mongoose.Types.ObjectId(),
      sessionId: "session-id",
      familyId: "family-id",
      currentTokenHash: "hash",
      currentTokenIssuedAt: new Date(),
      currentTokenExpiresAt: new Date(Date.now() + 60_000),
      lastUsedAt: new Date(),
      revokedReason: "contains-sensitive-token",
    });

    expect(session.validateSync()?.errors.revokedReason).toBeDefined();
  });
});

import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_EXPIRES_IN,
  createSessionAccessToken,
  createSessionRefreshToken,
  generateFamilyId,
  generateSessionId,
  generateTokenId,
  hashRefreshToken,
  verifySessionAccessToken,
  verifySessionRefreshToken,
} from "../src/utils/sessionTokens";

const accessSecret = "access-7f3c9a1d4e8b2c6f0a5d3e7b1c9f4a8d";
const refreshSecret = "refresh-2c8e6a1f4d9b7e3a5c0f2d6b8a1e4c7f";
const userId = "507f1f77bcf86cd799439011";
const sessionId = "session-id";
const familyId = "family-id";
const tokenId = "token-id";

beforeEach(() => {
  process.env.JWT_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = refreshSecret;
});

describe("session and token identifiers", () => {
  it("generates independent cryptographically random identifiers", () => {
    const identifiers = [
      generateSessionId(),
      generateFamilyId(),
      generateTokenId(),
    ];

    expect(new Set(identifiers).size).toBe(3);
    for (const identifier of identifiers) {
      expect(identifier).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});

describe("refresh-token hashing", () => {
  it("is deterministic for the same token and differs for different tokens", () => {
    expect(hashRefreshToken("refresh-token")).toBe(
      hashRefreshToken("refresh-token")
    );
    expect(hashRefreshToken("refresh-token")).not.toBe(
      hashRefreshToken("different-token")
    );
    expect(hashRefreshToken("refresh-token")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("session JWT primitives", () => {
  it("creates and verifies access tokens with access claims and 15-minute expiry", () => {
    const token = createSessionAccessToken(userId, sessionId);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    const verified = verifySessionAccessToken(token);

    expect(decoded).toMatchObject({
      id: userId,
      sub: userId,
      sid: sessionId,
      typ: "access",
    });
    expect(verified).toMatchObject({
      sub: userId,
      sid: sessionId,
      typ: "access",
    });
    expect(verified.exp - verified.iat).toBe(15 * 60);
    expect(ACCESS_TOKEN_EXPIRES_IN).toBe("15m");
  });

  it("creates and verifies refresh tokens with refresh claims and seven-day expiry", () => {
    const token = createSessionRefreshToken(
      userId,
      sessionId,
      familyId,
      tokenId
    );
    const decoded = jwt.decode(token) as Record<string, unknown>;
    const verified = verifySessionRefreshToken(token);

    expect(decoded).toMatchObject({
      sub: userId,
      sid: sessionId,
      fid: familyId,
      jti: tokenId,
      typ: "refresh",
    });
    expect(verified).toMatchObject({
      sub: userId,
      sid: sessionId,
      fid: familyId,
      jti: tokenId,
      typ: "refresh",
    });
    expect(verified.exp - verified.iat).toBe(7 * 24 * 60 * 60);
  });

  it("rejects a refresh token where an access token is expected", () => {
    const token = createSessionRefreshToken(
      userId,
      sessionId,
      familyId,
      tokenId
    );

    expect(() => verifySessionAccessToken(token)).toThrow();
  });

  it("rejects malformed required claims", () => {
    const token = jwt.sign(
      { sub: userId, typ: "access" },
      accessSecret,
      { algorithm: "HS256", expiresIn: "15m" }
    );

    expect(() => verifySessionAccessToken(token)).toThrow(
      "Invalid JWT: sid claim is required"
    );
  });

  it("rejects mismatched legacy id and sub claims", () => {
    const token = jwt.sign(
      {
        id: "different-user",
        sub: userId,
        sid: sessionId,
        typ: "access",
      },
      accessSecret,
      { algorithm: "HS256", expiresIn: "15m" }
    );

    expect(() => verifySessionAccessToken(token)).toThrow(
      "Invalid JWT: id and sub claims must match"
    );
  });

  it("rejects invalid signatures", () => {
    const token = jwt.sign(
      { sub: userId, sid: sessionId, typ: "access" },
      "wrong-5a8c1e3f7b9d2c6a4e0f8b1d3c7a9e5f",
      { algorithm: "HS256", expiresIn: "15m" }
    );

    expect(() => verifySessionAccessToken(token)).toThrow();
  });

  it("rejects unexpected algorithms", () => {
    const token = jwt.sign(
      { sub: userId, sid: sessionId, typ: "access" },
      accessSecret,
      { algorithm: "HS384", expiresIn: "15m" }
    );

    expect(() => verifySessionAccessToken(token)).toThrow();
  });
});

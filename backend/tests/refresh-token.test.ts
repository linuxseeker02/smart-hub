import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokenExpiredError } from "jsonwebtoken";

const mocks = vi.hoisted(() => ({
  authSessionFindOne: vi.fn(),
  authSessionFindOneAndUpdate: vi.fn(),
  authSessionUpdateMany: vi.fn(),
  userFindById: vi.fn(),
  createSessionAccessToken: vi.fn(() => "replacement-access-token"),
  createSessionRefreshToken: vi.fn(() => "replacement-refresh-token"),
  generateTokenId: vi.fn(() => "replacement-token-id"),
  hashRefreshToken: vi.fn((token: string) =>
    token === "presented-refresh-token" ? "presented-hash" : "replacement-hash"
  ),
  verifySessionRefreshToken: vi.fn(),
}));

vi.mock("../src/models/AuthSession", () => ({
  default: {
    findOne: mocks.authSessionFindOne,
    findOneAndUpdate: mocks.authSessionFindOneAndUpdate,
    updateMany: mocks.authSessionUpdateMany,
  },
}));
vi.mock("../src/models/User", () => ({
  default: {
    findById: mocks.userFindById,
  },
}));
vi.mock("bcryptjs", () => ({
  default: {},
}));
vi.mock("../src/utils/sessionTokens", () => ({
  createSessionAccessToken: mocks.createSessionAccessToken,
  createSessionRefreshToken: mocks.createSessionRefreshToken,
  generateFamilyId: vi.fn(),
  generateSessionId: vi.fn(),
  generateTokenId: mocks.generateTokenId,
  hashRefreshToken: mocks.hashRefreshToken,
  verifySessionRefreshToken: mocks.verifySessionRefreshToken,
}));

import { refresh } from "../src/controllers/authController";

const claims = {
  sub: "507f1f77bcf86cd799439011",
  sid: "session-id",
  fid: "family-id",
  jti: "token-id",
  typ: "refresh" as const,
  iat: 1_700_000_000,
  exp: 1_800_000_000,
};

const makeResponse = () => {
  const response = {
    cookie: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
};

const makeSession = (currentTokenHash = "presented-hash") => ({
  userId: { toString: () => claims.sub },
  sessionId: claims.sid,
  familyId: claims.fid,
  currentTokenHash,
  currentTokenIssuedAt: new Date("2026-10-25T07:00:00.000Z"),
  currentTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  lastUsedAt: new Date("2026-10-25T07:00:00.000Z"),
  revokedAt: null,
});

const useSessionLookup = (session: ReturnType<typeof makeSession> | null) => {
  mocks.authSessionFindOne.mockImplementation(() => ({
    select: vi.fn().mockResolvedValue(session),
  }));
};

const runRefresh = async (token = "presented-refresh-token") => {
  const response = makeResponse();
  await refresh(
    { cookies: token === "" ? {} : { refreshToken: token } } as never,
    response as never
  );
  return response;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifySessionRefreshToken.mockReturnValue(claims);
  mocks.authSessionUpdateMany.mockResolvedValue({ modifiedCount: 1 });
  mocks.authSessionFindOneAndUpdate.mockResolvedValue(makeSession("replacement-hash"));
  useSessionLookup(makeSession());
  mocks.userFindById.mockReturnValue({
    select: vi.fn().mockResolvedValue({ isActive: true }),
  });
  process.env.JWT_SECRET =
    "access-7f3c9a1d4e8b2c6f0a5d3e7b1c9f4a8d";
  process.env.JWT_REFRESH_SECRET =
    "refresh-2c8e6a1f4d9b7e3a5c0f2d6b8a1e4c7f";
});

describe("refresh-token rotation", () => {
  it("rotates the hash and sets replacement cookies only after CAS success", async () => {
    const response = await runRefresh();

    expect(mocks.authSessionFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: claims.sub,
        sessionId: claims.sid,
        familyId: claims.fid,
        revokedAt: null,
        currentTokenHash: "presented-hash",
        currentTokenExpiresAt: expect.objectContaining({ $gt: expect.any(Date) }),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          currentTokenHash: "replacement-hash",
          currentTokenIssuedAt: expect.any(Date),
          currentTokenExpiresAt: expect.any(Date),
          lastUsedAt: expect.any(Date),
        }),
      }),
      { new: true, runValidators: true }
    );
    expect(response.cookie).toHaveBeenCalledTimes(3);
    expect(response.cookie.mock.calls.map(([name]) => name)).toEqual([
      "accessToken",
      "token",
      "refreshToken",
    ]);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ message: "Token refreshed" });
    expect(
      response.cookie.mock.calls.some(([, value]) => value === "presented-refresh-token")
    ).toBe(false);
  });

  it("does not issue replacement cookies before persistence succeeds", async () => {
    mocks.authSessionFindOneAndUpdate.mockResolvedValue(null);
    const response = await runRefresh();

    expect(response.cookie).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      message: "Server error during token refresh",
    });

  });

  it("rejects a disabled account before rotating its refresh token", async () => {
    mocks.userFindById.mockReturnValue({
      select: vi.fn().mockResolvedValue({ isActive: false }),
    });
    const response = await runRefresh();

    expect(mocks.authSessionFindOneAndUpdate).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      message: "Refresh token invalid or expired",
    });
  });

  it("rejects a previously rotated token and revokes its family", async () => {
    useSessionLookup(makeSession("different-current-hash"));
    const response = await runRefresh();

    expect(mocks.authSessionUpdateMany).toHaveBeenCalledWith(
      {
        userId: claims.sub,
        familyId: claims.fid,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: expect.any(Date),
          revokedReason: "reuse_detected",
        },
      }
    );
    expect(response.cookie).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      message: "Refresh token reuse detected",
    });
  });

  it("does not revoke a family when the database operation fails ambiguously", async () => {
    mocks.authSessionFindOneAndUpdate.mockRejectedValue(new Error("database unavailable"));
    const response = await runRefresh();

    expect(mocks.authSessionUpdateMany).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(500);
  });

  it("rejects a different session or family without revoking the presented family", async () => {
    useSessionLookup({
      ...makeSession(),
      sessionId: "other-session",
    });
    const response = await runRefresh();

    expect(mocks.authSessionUpdateMany).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it.each([
    ["expired", { ...makeSession(), currentTokenExpiresAt: new Date("2020-01-01") }],
    ["revoked", { ...makeSession(), revokedAt: new Date("2026-10-25") }],
  ])("rejects a %s session", async (_label, session) => {
    useSessionLookup(session);
    const response = await runRefresh();

    expect(mocks.authSessionFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.authSessionUpdateMany).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it("rejects invalid, malformed, wrongly typed, and missing refresh tokens", async () => {
    mocks.verifySessionRefreshToken.mockImplementation(() => {
      throw new Error("invalid token");
    });
    const invalidResponse = await runRefresh("invalid-token");
    expect(invalidResponse.status).toHaveBeenCalledWith(401);
    expect(mocks.authSessionFindOne).not.toHaveBeenCalled();

    mocks.verifySessionRefreshToken.mockReturnValue({
      ...claims,
      typ: "access",
    });
    const wrongTypeResponse = await runRefresh();
    expect(wrongTypeResponse.status).toHaveBeenCalledWith(401);

    mocks.verifySessionRefreshToken.mockImplementation(() => {
      throw new TokenExpiredError("jwt expired", new Date());
    });
    const expiredResponse = await runRefresh();
    expect(expiredResponse.status).toHaveBeenCalledWith(401);
    expect(expiredResponse.json).toHaveBeenCalledWith({
      message: "Refresh token expired",
    });

    const missingResponse = await runRefresh("");
    expect(missingResponse.status).toHaveBeenCalledWith(401);
  });

  it("rechecks after a failed CAS and revokes on confirmed concurrent replay", async () => {
    const currentSession = makeSession();
    let lookupCount = 0;
    mocks.authSessionFindOne.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue(
        lookupCount++ === 0 ? currentSession : makeSession("replacement-hash")
      ),
    }));
    mocks.authSessionFindOneAndUpdate.mockResolvedValue(null);

    const response = await runRefresh();

    expect(mocks.authSessionFindOne).toHaveBeenCalledTimes(2);
    expect(mocks.authSessionUpdateMany).toHaveBeenCalledTimes(1);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.cookie).not.toHaveBeenCalled();
  });
});

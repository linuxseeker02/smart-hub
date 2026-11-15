import { TokenExpiredError } from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authSessionFindOne: vi.fn(),
  authSessionUpdateOne: vi.fn(),
  verifySessionAccessToken: vi.fn(),
  verifySessionRefreshToken: vi.fn(),
  hashRefreshToken: vi.fn(() => "current-hash"),
}));

vi.mock("../src/models/User", () => ({ default: {} }));
vi.mock("../src/models/AuthSession", () => ({
  default: {
    findOne: mocks.authSessionFindOne,
    updateOne: mocks.authSessionUpdateOne,
  },
}));
vi.mock("bcryptjs", () => ({ default: {} }));
vi.mock("../src/utils/sessionTokens", () => ({
  createSessionAccessToken: vi.fn(),
  createSessionRefreshToken: vi.fn(),
  generateFamilyId: vi.fn(),
  generateSessionId: vi.fn(),
  generateTokenId: vi.fn(),
  hashRefreshToken: mocks.hashRefreshToken,
  verifySessionAccessToken: mocks.verifySessionAccessToken,
  verifySessionRefreshToken: mocks.verifySessionRefreshToken,
}));

import { logout } from "../src/controllers/authController";

const accessClaims = {
  sub: "507f1f77bcf86cd799439011",
  sid: "session-id",
  typ: "access" as const,
  iat: 1_700_000_000,
  exp: 1_800_000_000,
};

const refreshClaims = {
  sub: accessClaims.sub,
  sid: accessClaims.sid,
  fid: "family-id",
  jti: "token-id",
  typ: "refresh" as const,
  iat: 1_700_000_000,
  exp: 1_800_000_000,
};

const makeResponse = () => {
  const response = {
    clearCookie: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
};

const makeSession = (revokedAt: Date | null = null) => ({
  userId: { toString: () => accessClaims.sub },
  sessionId: accessClaims.sid,
  familyId: refreshClaims.fid,
  currentTokenHash: "current-hash",
  currentTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  revokedAt,
});

const configureSessionLookup = (session: ReturnType<typeof makeSession> | null) => {
  mocks.authSessionFindOne.mockImplementation(() => {
    if (!session) {
      return {
        select: vi.fn().mockResolvedValue(null),
      };
    }

    return Object.assign(session, {
      select: vi.fn().mockResolvedValue(session),
    });
  });
};

const runLogout = async (cookies: Record<string, string> = {}) => {
  const response = makeResponse();
  await logout({ cookies } as never, response as never);
  return response;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authSessionUpdateOne.mockResolvedValue({ matchedCount: 1 });
  configureSessionLookup(makeSession());
  mocks.verifySessionAccessToken.mockReturnValue(accessClaims);
  mocks.verifySessionRefreshToken.mockReturnValue(refreshClaims);
});

describe("server-side logout revocation", () => {
  it("revokes the authenticated session before clearing all auth cookies", async () => {
    const response = await runLogout({
      token: "access-token",
      refreshToken: "refresh-token",
    });

    expect(mocks.authSessionUpdateOne).toHaveBeenCalledWith(
      {
        userId: accessClaims.sub,
        sessionId: accessClaims.sid,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: expect.any(Date),
          revokedReason: "logout",
        },
      }
    );
    expect(mocks.authSessionUpdateOne.mock.invocationCallOrder[0]).toBeLessThan(
      response.clearCookie.mock.invocationCallOrder[0]
    );
    expect(response.clearCookie).toHaveBeenCalledTimes(3);
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("treats repeated logout for an already revoked session as successful", async () => {
    mocks.authSessionUpdateOne.mockResolvedValue({ matchedCount: 0 });
    configureSessionLookup(makeSession(new Date("2026-10-25T08:00:00.000Z")));

    const response = await runLogout({ token: "access-token" });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.clearCookie).toHaveBeenCalledTimes(3);
  });

  it("uses a valid refresh cookie when the access token is expired", async () => {
    mocks.verifySessionAccessToken.mockImplementation(() => {
      throw new TokenExpiredError("jwt expired", new Date());
    });

    const response = await runLogout({
      accessToken: "expired-access-token",
      refreshToken: "refresh-token",
    });

    expect(mocks.verifySessionRefreshToken).toHaveBeenCalledWith(
      "refresh-token"
    );
    expect(mocks.authSessionUpdateOne).toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("revokes a matching access and refresh session", async () => {
    const response = await runLogout({
      token: "access-token",
      refreshToken: "refresh-token",
    });

    expect(mocks.authSessionUpdateOne).toHaveBeenCalledWith(
      {
        userId: accessClaims.sub,
        sessionId: accessClaims.sid,
        revokedAt: null,
      },
      expect.objectContaining({
        $set: expect.objectContaining({ revokedReason: "logout" }),
      })
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("rejects mismatched access and refresh session IDs without revoking either", async () => {
    mocks.verifySessionRefreshToken.mockReturnValue({
      ...refreshClaims,
      sid: "different-session",
    });

    const response = await runLogout({
      token: "access-token",
      refreshToken: "refresh-token",
    });

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.clearCookie).toHaveBeenCalledTimes(3);
    expect(mocks.authSessionUpdateOne).not.toHaveBeenCalled();
  });

  it("rejects mismatched access and refresh user IDs without revoking either", async () => {
    mocks.verifySessionRefreshToken.mockReturnValue({
      ...refreshClaims,
      sub: "507f1f77bcf86cd799439012",
    });

    const response = await runLogout({
      token: "access-token",
      refreshToken: "refresh-token",
    });

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.clearCookie).toHaveBeenCalledTimes(3);
    expect(mocks.authSessionUpdateOne).not.toHaveBeenCalled();
  });

  it("rejects a valid access token paired with an invalid refresh token", async () => {
    mocks.verifySessionRefreshToken.mockImplementation(() => {
      throw new Error("invalid refresh token");
    });

    const response = await runLogout({
      token: "access-token",
      refreshToken: "invalid-refresh-token",
    });

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.clearCookie).toHaveBeenCalledTimes(3);
    expect(mocks.authSessionUpdateOne).not.toHaveBeenCalled();
  });

  it.each([
    ["missing cookies", {}],
    ["invalid access token", { token: "invalid-access-token" }],
    ["invalid refresh token", { refreshToken: "invalid-refresh-token" }],
  ])("rejects %s and clears cookies", async (_label, cookies) => {
    if (cookies.token) {
      mocks.verifySessionAccessToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
    }
    if (cookies.refreshToken) {
      mocks.verifySessionRefreshToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
    }

    const response = await runLogout(cookies);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.clearCookie).toHaveBeenCalledTimes(3);
    expect(mocks.authSessionUpdateOne).not.toHaveBeenCalled();
  });

  it("does not report success when revocation fails, but still clears cookies", async () => {
    mocks.authSessionUpdateOne.mockRejectedValue(new Error("database unavailable"));

    const response = await runLogout({ token: "access-token" });

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      message: "Server error during logout",
    });
    expect(response.clearCookie).toHaveBeenCalledTimes(3);
  });

  it("rejects an expired refresh cookie when the access token is also unusable", async () => {
    mocks.verifySessionAccessToken.mockImplementation(() => {
      throw new Error("invalid access token");
    });
    mocks.verifySessionRefreshToken.mockImplementation(() => {
      throw new TokenExpiredError("jwt expired", new Date());
    });

    const response = await runLogout({
      accessToken: "expired-access-token",
      refreshToken: "expired-refresh-token",
    });

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.clearCookie).toHaveBeenCalledTimes(3);
    expect(mocks.authSessionUpdateOne).not.toHaveBeenCalled();
  });
});

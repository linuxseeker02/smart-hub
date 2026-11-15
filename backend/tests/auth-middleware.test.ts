import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSessionAccessToken,
  createSessionRefreshToken,
} from "../src/utils/sessionTokens";

const mocks = vi.hoisted(() => ({
  authSessionFindOne: vi.fn(),
  userFindById: vi.fn(),
}));

vi.mock("../src/models/AuthSession", () => ({
  default: {
    findOne: mocks.authSessionFindOne,
  },
}));

vi.mock("../src/models/User", () => ({
  default: {
    findById: mocks.userFindById,
  },
}));

import { protect } from "../src/middleware/authMiddleware";

const accessSecret = "access-7f3c9a1d4e8b2c6f0a5d3e7b1c9f4a8d";
const refreshSecret = "refresh-2c8e6a1f4d9b7e3a5c0f2d6b8a1e4c7f";
const userId = "507f1f77bcf86cd799439011";
const sessionId = "session-id";

const makeResponse = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
};

const runProtect = async (
  token: string | undefined,
  session: unknown = { sessionId, userId }
) => {
  const response = makeResponse();
  const next = vi.fn();
  const request = {
    cookies: token === undefined ? {} : { token },
  };

  mocks.authSessionFindOne.mockResolvedValue(session);
  const selectUser = vi.fn().mockResolvedValue({ isActive: true });
  mocks.userFindById.mockReturnValue({ select: selectUser });
  await protect(request as never, response as never, next);

  return { response, next, request };
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = refreshSecret;
});

describe("access-token middleware", () => {
  it("accepts a valid access token with an active session", async () => {
    const token = createSessionAccessToken(userId, sessionId);
    const { next, request } = await runProtect(token);

    expect(next).toHaveBeenCalledTimes(1);
    expect(request.user).toEqual({ id: userId });
    expect(mocks.authSessionFindOne).toHaveBeenCalledWith({
      userId,
      sessionId,
      revokedAt: null,
    });
  });

  it("rejects a valid access token with a revoked session", async () => {
    const token = createSessionAccessToken(userId, sessionId);
    const { response, next } = await runProtect(token, null);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it("rejects a valid access token when the session is missing", async () => {
    const token = createSessionAccessToken(userId, sessionId);
    const { response, next } = await runProtect(token, null);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it("rejects a token after its session is revoked", async () => {
    const token = createSessionAccessToken(userId, sessionId);
    mocks.authSessionFindOne
      .mockResolvedValueOnce({ sessionId, userId })
      .mockResolvedValueOnce(null);

    const firstResponse = makeResponse();
    const firstNext = vi.fn();
    await protect(
      { cookies: { token } } as never,
      firstResponse as never,
      firstNext
    );

    const secondResponse = makeResponse();
    const secondNext = vi.fn();
    await protect(
      { cookies: { token } } as never,
      secondResponse as never,
      secondNext
    );

    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(secondNext).not.toHaveBeenCalled();
    expect(secondResponse.status).toHaveBeenCalledWith(401);
  });

  it("rejects a valid access token when user or session identifiers do not match", async () => {
    const token = createSessionAccessToken(userId, sessionId);
    const { response, next } = await runProtect(token, null);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it("rejects a refresh token presented as an access token", async () => {
    const token = createSessionRefreshToken(
      userId,
      sessionId,
      "family-id",
      "token-id"
    );
    const { response, next } = await runProtect(token);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      message: "Token invalid or expired",
    });
  });

  it.each([
    ["missing typ", { sub: userId, sid: sessionId }],
    ["missing sub", { sid: sessionId, typ: "access" }],
    ["malformed sub", { sub: 123, sid: sessionId, typ: "access" }],
    ["missing sid", { sub: userId, typ: "access" }],
    ["malformed sid", { sub: userId, sid: 123, typ: "access" }],
  ])("rejects %s", async (_label, claims) => {
    const token = jwt.sign(claims, accessSecret, {
      algorithm: "HS256",
      expiresIn: "15m",
    });
    const { response, next } = await runProtect(token);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it("rejects mismatched legacy id and sub claims", async () => {
    const token = jwt.sign(
      { id: "different-user", sub: userId, sid: sessionId, typ: "access" },
      accessSecret,
      { algorithm: "HS256", expiresIn: "15m" }
    );
    const { response, next } = await runProtect(token);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it.each([
    [
      "invalid signature",
      () =>
        jwt.sign(
          { sub: userId, sid: sessionId, typ: "access" },
          "wrong-5a8c1e3f7b9d2c6a4e0f8b1d3c7a9e5f",
          { algorithm: "HS256", expiresIn: "15m" }
        ),
    ],
    [
      "unexpected algorithm",
      () =>
        jwt.sign(
          { sub: userId, sid: sessionId, typ: "access" },
          accessSecret,
          { algorithm: "HS384", expiresIn: "15m" }
        ),
    ],
    [
      "expired token",
      () =>
        jwt.sign(
          { sub: userId, sid: sessionId, typ: "access" },
          accessSecret,
          { algorithm: "HS256", expiresIn: -1 }
        ),
    ],
  ])("rejects %s", async (_label, createToken) => {
    const { response, next } = await runProtect(createToken());

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it("rejects the legacy id-only token format", async () => {
    const token = jwt.sign({ id: userId }, accessSecret, {
      algorithm: "HS256",
      expiresIn: "15m",
    });
    const { response, next } = await runProtect(token);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it("fails closed when the session lookup fails", async () => {
    const token = createSessionAccessToken(userId, sessionId);
    mocks.authSessionFindOne.mockRejectedValue(new Error("database unavailable"));
    const response = makeResponse();
    const next = vi.fn();

    await protect(
      { cookies: { token } } as never,
      response as never,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      message: "Authentication service unavailable",
    });
  });

  it("rejects a disabled account", async () => {
      const token = createSessionAccessToken(userId, sessionId);
      mocks.authSessionFindOne.mockResolvedValue({
        userId,
        sessionId,
        revokedAt: null,
      });
      mocks.userFindById.mockReturnValue({
        select: vi.fn().mockResolvedValue({ isActive: false }),
      });
      const response = makeResponse();
      const next = vi.fn();

      await protect(
        { cookies: { token } } as never,
        response as never,
        next
      );

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toHaveBeenCalledWith(401);
  });
});

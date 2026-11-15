import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  userFindById: vi.fn(),
  userCreate: vi.fn(),
  userDeleteOne: vi.fn(),
  authSessionCreate: vi.fn(),
  bcryptCompare: vi.fn(),
  bcryptHash: vi.fn(),
  createSessionAccessToken: vi.fn(() => "access-token"),
  createSessionRefreshToken: vi.fn(() => "refresh-token"),
  generateFamilyId: vi.fn(() => "family-id"),
  generateSessionId: vi.fn(() => "session-id"),
  generateTokenId: vi.fn(() => "token-id"),
  hashRefreshToken: vi.fn(() => "refresh-token-hash"),
}));

vi.mock("../src/models/User", () => ({
  default: {
    findOne: mocks.userFindOne,
    findById: mocks.userFindById,
    create: mocks.userCreate,
    deleteOne: mocks.userDeleteOne,
  },
}));
vi.mock("../src/models/AuthSession", () => ({
  default: { create: mocks.authSessionCreate },
}));
vi.mock("bcryptjs", () => ({
  default: { compare: mocks.bcryptCompare, hash: mocks.bcryptHash },
}));
vi.mock("../src/utils/sessionTokens", () => ({
  createSessionAccessToken: mocks.createSessionAccessToken,
  createSessionRefreshToken: mocks.createSessionRefreshToken,
  generateFamilyId: mocks.generateFamilyId,
  generateSessionId: mocks.generateSessionId,
  generateTokenId: mocks.generateTokenId,
  hashRefreshToken: mocks.hashRefreshToken,
}));

import { login, register } from "../src/controllers/authController";

const makeResponse = () => {
  const response = {
    cookie: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
};

const user = {
  _id: { toString: () => "user-123" },
  name: "Test User",
  email: "user@example.test",
  role: "student",
  passwordHash: "bcrypt-hash",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authSessionCreate.mockResolvedValue({});
  mocks.userDeleteOne.mockResolvedValue({ deletedCount: 1 });
  mocks.bcryptHash.mockResolvedValue("password-hash");
  mocks.userFindById.mockReturnValue({
    select: vi.fn().mockResolvedValue({ isActive: true }),
  });
});

describe("login authentication responses", () => {
  it("returns the generic failure for an unknown email", async () => {
    mocks.userFindOne.mockResolvedValue(null);
    const response = makeResponse();

    await login(
      { body: { email: "unknown@example.test", password: "wrong-password" } } as never,
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ message: "Invalid credentials" });
    expect(mocks.bcryptCompare).not.toHaveBeenCalled();
    expect(mocks.authSessionCreate).not.toHaveBeenCalled();
  });

  it("returns the same generic failure for an incorrect password", async () => {
    mocks.userFindOne.mockResolvedValue(user);
    mocks.bcryptCompare.mockResolvedValue(false);
    const response = makeResponse();

    await login(
      { body: { email: user.email, password: "wrong-password" } } as never,
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ message: "Invalid credentials" });
    expect(mocks.bcryptCompare).toHaveBeenCalledWith("wrong-password", user.passwordHash);
    expect(mocks.authSessionCreate).not.toHaveBeenCalled();
  });

  it("creates a session before returning successful login", async () => {
    mocks.userFindOne.mockResolvedValue(user);
    mocks.bcryptCompare.mockResolvedValue(true);
    const response = makeResponse();

    await login(
      { body: { email: user.email, password: "correct-password" } } as never,
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    expect(response.cookie).toHaveBeenCalledTimes(3);
    expect(response.cookie.mock.calls.map(([name]) => name)).toEqual([
      "accessToken",
      "token",
      "refreshToken",
    ]);
    expect(mocks.authSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        sessionId: "session-id",
        familyId: "family-id",
        currentTokenHash: "refresh-token-hash",
        currentTokenIssuedAt: expect.any(Date),
        currentTokenExpiresAt: expect.any(Date),
        lastUsedAt: expect.any(Date),
      })
    );
    const persistedSession = mocks.authSessionCreate.mock.calls[0][0];
    expect(persistedSession).not.toHaveProperty("refreshToken");
    expect(persistedSession).not.toHaveProperty("currentToken");
    expect(
      persistedSession.currentTokenExpiresAt.getTime() -
        persistedSession.currentTokenIssuedAt.getTime()
    ).toBe(7 * 24 * 60 * 60 * 1000);
    expect(mocks.createSessionAccessToken).toHaveBeenCalledWith(
      "user-123",
      "session-id"
    );
    expect(mocks.createSessionRefreshToken).toHaveBeenCalledWith(
      "user-123",
      "session-id",
      "family-id",
      "token-id"
    );
    expect(mocks.hashRefreshToken).toHaveBeenCalledWith("refresh-token");
  });

  it("rejects disabled users without creating a session or cookies", async () => {
    mocks.userFindOne.mockResolvedValue({ ...user, isActive: false });
    mocks.bcryptCompare.mockResolvedValue(true);
    const response = makeResponse();

    await login(
      { body: { email: user.email, password: "correct-password" } } as never,
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ message: "Invalid credentials" });
    expect(response.cookie).not.toHaveBeenCalled();
    expect(mocks.authSessionCreate).not.toHaveBeenCalled();
  });

  it("does not return success or set cookies when login session persistence fails", async () => {
    mocks.userFindOne.mockResolvedValue(user);
    mocks.bcryptCompare.mockResolvedValue(true);
    mocks.authSessionCreate.mockRejectedValue(new Error("session persistence failed"));
    const response = makeResponse();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await login(
      { body: { email: user.email, password: "correct-password" } } as never,
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      message: "Server error during login",
    });
    expect(response.cookie).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("registration session creation", () => {
  it("creates a session and preserves the registration response contract", async () => {
    mocks.userFindOne.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({
      ...user,
      _id: user._id,
    });
    const response = makeResponse();

    await register(
      {
        body: {
          name: user.name,
          email: user.email,
          password: "correct-password",
        },
      } as never,
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
    expect(response.cookie).toHaveBeenCalledTimes(3);
    expect(response.cookie.mock.calls.map(([name]) => name)).toEqual([
      "accessToken",
      "token",
      "refreshToken",
    ]);
    expect(mocks.authSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        currentTokenHash: "refresh-token-hash",
      })
    );
  });

  it("ignores an administrator role submitted during public registration", async () => {
    mocks.userFindOne.mockResolvedValue(null);
    mocks.userCreate.mockImplementation(async (payload) => ({
      ...user,
      ...payload,
      _id: user._id,
    }));
    const response = makeResponse();

    await register(
      {
        body: {
          name: user.name,
          email: user.email,
          password: "correct-password",
          role: "admin",
        },
      } as never,
      response as never
    );

    expect(mocks.userCreate).toHaveBeenCalledWith({
      name: user.name,
      email: user.email,
      passwordHash: "password-hash",
    });
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ role: "student" })
    );
  });

  it("does not return success or set cookies when registration session persistence fails", async () => {
    mocks.userFindOne.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue(user);
    mocks.authSessionCreate.mockRejectedValue(new Error("session persistence failed"));
    const response = makeResponse();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await register(
      {
        body: {
          name: user.name,
          email: user.email,
          password: "correct-password",
        },
      } as never,
      response as never
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      message: "Server error during registration",
    });
    expect(response.cookie).not.toHaveBeenCalled();
    expect(mocks.userDeleteOne).toHaveBeenCalledWith({ _id: user._id });
    expect(mocks.authSessionCreate).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

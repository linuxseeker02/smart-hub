import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { protect } from "../src/middleware/authMiddleware";

const accessSecret = "access-7f3c9a1d4e8b2c6f0a5d3e7b1c9f4a8d";
const refreshSecret = "refresh-2c8e6a1f4d9b7e3a5c0f2d6b8a1e4c7f";

beforeEach(() => {
  process.env.JWT_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = refreshSecret;
});

describe("JWT algorithm restriction", () => {
  it("rejects tokens signed with an unexpected algorithm", () => {
    const token = jwt.sign({ id: "user-123" }, accessSecret, {
      algorithm: "HS384",
    });
    const response = {
      status: vi.fn(),
      json: vi.fn(),
    };
    const next = vi.fn();
    response.status.mockReturnValue(response);

    protect(
      { cookies: { accessToken: token } } as never,
      response as never,
      next
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      message: "Token invalid or expired",
    });
    expect(next).not.toHaveBeenCalled();
  });
});

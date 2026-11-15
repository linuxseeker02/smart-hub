import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindById: vi.fn(),
}));

vi.mock("../src/models/User", () => ({
  default: {
    findById: mocks.userFindById,
  },
}));

import { requireRoles } from "../src/middleware/roleMiddleware";

const makeResponse = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
};

const runAuthorization = async (
  requestUser: { id: string } | undefined,
  role: string | undefined,
  lookupError?: Error
) => {
  const response = makeResponse();
  const next = vi.fn();
  const select = vi.fn();

  if (lookupError) {
    select.mockRejectedValue(lookupError);
  } else {
    select.mockResolvedValue(role === undefined ? null : { role });
  }
  mocks.userFindById.mockReturnValue({ select });

  const middleware = requireRoles("admin");
  await middleware(
    { user: requestUser } as never,
    response as never,
    next
  );

  return { response, next, select };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("database-backed role authorization", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const { response, next } = await runAuthorization(undefined, "admin");

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      message: "Not authenticated",
    });
    expect(next).not.toHaveBeenCalled();
    expect(mocks.userFindById).not.toHaveBeenCalled();
  });

  it("rejects a student attempting administrator access with 403", async () => {
    const { response, next } = await runAuthorization(
      { id: "student-id" },
      "student"
    );

    expect(mocks.userFindById).toHaveBeenCalledWith("student-id");
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({ message: "Forbidden" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows an administrator whose role is loaded from the database", async () => {
    const { response, next } = await runAuthorization(
      { id: "admin-id" },
      "admin"
    );

    expect(response.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing user", undefined],
    ["invalid user role", "moderator"],
  ])("rejects %s with 403", async (_label, role) => {
    const { response, next } = await runAuthorization(
      { id: "user-id" },
      role
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed when the role lookup fails", async () => {
    const { response, next } = await runAuthorization(
      { id: "admin-id" },
      "admin",
      new Error("database unavailable")
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      message: "Authorization service unavailable",
    });
    expect(next).not.toHaveBeenCalled();
  });
});

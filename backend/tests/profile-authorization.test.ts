import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
}));

vi.mock("../src/models/StudentProfile", () => ({
  default: {
    findOneAndUpdate: mocks.findOneAndUpdate,
  },
}));

import { upsertProfile } from "../src/controllers/profileController";

const makeResponse = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOneAndUpdate.mockResolvedValue({ user: "user-id" });
});

describe("profile privilege-field handling", () => {
  it("does not allow a profile update to change the user's role", async () => {
    const response = makeResponse();

    await upsertProfile(
      {
        user: { id: "user-id" },
        body: {
          fullName: "Student",
          role: "admin",
          isAdmin: true,
          permissions: ["manage-users"],
        },
      } as never,
      response as never
    );

    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { user: "user-id" },
      expect.not.objectContaining({
        role: "admin",
        isAdmin: true,
        permissions: ["manage-users"],
      }),
      expect.objectContaining({ runValidators: true })
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });
});

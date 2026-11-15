import { describe, expect, it } from "vitest";
import { MIN_JWT_SECRET_LENGTH, validateJwtConfig } from "../src/utils/jwtConfig";

const secret = (prefix: string) =>
  `${prefix}-7f3c9a1d4e8b2c6f0a5d3e7b1c9f4a8d`;

describe("JWT configuration validation", () => {
  it("rejects a missing access-token secret", () => {
    expect(() =>
      validateJwtConfig({ JWT_REFRESH_SECRET: secret("refresh") })
    ).toThrow("JWT_SECRET is required");
  });

  it("rejects a missing refresh-token secret", () => {
    expect(() =>
      validateJwtConfig({ JWT_SECRET: secret("access") })
    ).toThrow("JWT_REFRESH_SECRET is required");
  });

  it("rejects a weak access-token secret", () => {
    expect(() =>
      validateJwtConfig({
        JWT_SECRET: "short",
        JWT_REFRESH_SECRET: secret("refresh"),
      })
    ).toThrow(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  });

  it("rejects a weak refresh-token secret", () => {
    expect(() =>
      validateJwtConfig({
        JWT_SECRET: secret("access"),
        JWT_REFRESH_SECRET: "short",
      })
    ).toThrow(
      `JWT_REFRESH_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`
    );
  });

  it("rejects identical access and refresh secrets", () => {
    const sharedSecret = secret("shared");

    expect(() =>
      validateJwtConfig({
        JWT_SECRET: sharedSecret,
        JWT_REFRESH_SECRET: sharedSecret,
      })
    ).toThrow("access and refresh secrets must be different");
  });

  it("accepts distinct secrets meeting the minimum length", () => {
    const config = validateJwtConfig({
      JWT_SECRET: secret("access"),
      JWT_REFRESH_SECRET: secret("refresh"),
    });

    expect(config).toEqual({
      accessTokenSecret: secret("access"),
      refreshTokenSecret: secret("refresh"),
    });
  });
});

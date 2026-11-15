export const MIN_JWT_SECRET_LENGTH = 32;

// Production values must be independently generated from a cryptographically
// secure source, preferably at least 32 random bytes encoded as hex or base64.
export interface JwtConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
}

export const validateJwtConfig = (
  env: NodeJS.ProcessEnv = process.env
): JwtConfig => {
  const accessTokenSecret = env.JWT_SECRET;
  const refreshTokenSecret = env.JWT_REFRESH_SECRET;

  if (!accessTokenSecret) {
    throw new Error("JWT configuration error: JWT_SECRET is required");
  }

  if (!refreshTokenSecret) {
    throw new Error("JWT configuration error: JWT_REFRESH_SECRET is required");
  }

  if (accessTokenSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT configuration error: JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`
    );
  }

  if (refreshTokenSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT configuration error: JWT_REFRESH_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`
    );
  }

  if (accessTokenSecret === refreshTokenSecret) {
    throw new Error(
      "JWT configuration error: access and refresh secrets must be different"
    );
  }

  return { accessTokenSecret, refreshTokenSecret };
};

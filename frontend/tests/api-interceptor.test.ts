import { AxiosAdapter, AxiosError, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api, { AUTH_STATE_INVALIDATED_EVENT } from "../src/lib/api";

const originalAdapter = api.defaults.adapter;
type TestRequestConfig = InternalAxiosRequestConfig & {
  _authRetry?: boolean;
};

const success = (
  config: InternalAxiosRequestConfig,
  data: unknown = { ok: true }
) => ({
  data,
  status: 200,
  statusText: "OK",
  headers: {},
  config,
});

const unauthorized = (config: InternalAxiosRequestConfig) => {
  const response = {
    data: { message: "Unauthorized" },
    status: 401,
    statusText: "Unauthorized",
    headers: {},
    config,
  };

  return Promise.reject(
    new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, undefined, response)
  );
};

const setAdapter = (adapter: AxiosAdapter): void => {
  api.defaults.adapter = adapter;
};

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { dispatchEvent: vi.fn() },
  });
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe("Axios authentication refresh interceptor", () => {
  it("shares one refresh request across concurrent 401 responses and retries each request once", async () => {
    let refreshRequests = 0;
    const attempts = new Map<string, number>();

    setAdapter(async (config) => {
      const path = config.url ?? "";
      attempts.set(path, (attempts.get(path) ?? 0) + 1);

      if (path === "/api/auth/refresh") {
        refreshRequests += 1;
        return success(config);
      }

      if (path === "/protected/one" || path === "/protected/two") {
        if ((config as TestRequestConfig)._authRetry) {
          return success(config, { path });
        }
        return unauthorized(config);
      }

      throw new Error(`Unexpected request: ${path}`);
    });

    const [first, second] = await Promise.all([
      api.get("/protected/one"),
      api.get("/protected/two"),
    ]);

    expect(refreshRequests).toBe(1);
    expect(attempts.get("/protected/one")).toBe(2);
    expect(attempts.get("/protected/two")).toBe(2);
    expect(first.data).toEqual({ path: "/protected/one" });
    expect(second.data).toEqual({ path: "/protected/two" });
  });

  it("rejects all waiting requests and dispatches one invalidation event when refresh fails", async () => {
    let refreshRequests = 0;
    const dispatchEvent = vi.mocked(window.dispatchEvent);

    setAdapter(async (config) => {
      if (config.url === "/api/auth/refresh") {
        refreshRequests += 1;
        return unauthorized(config);
      }
      return unauthorized(config);
    });

    const results = await Promise.allSettled([
      api.get("/protected/one"),
      api.get("/protected/two"),
    ]);

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(refreshRequests).toBe(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.anything()
    );
    expect(dispatchEvent.mock.calls[0]?.[0].type).toBe(
      AUTH_STATE_INVALIDATED_EVENT
    );
  });

  it("does not refresh-loop when the retried request also returns 401", async () => {
    let refreshRequests = 0;
    let protectedAttempts = 0;

    setAdapter(async (config) => {
      if (config.url === "/api/auth/refresh") {
        refreshRequests += 1;
        return success(config);
      }

      protectedAttempts += 1;
      return unauthorized(config);
    });

    await expect(api.get("/protected/loop")).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(refreshRequests).toBe(1);
    expect(protectedAttempts).toBe(2);
  });

  it("does not refresh requests marked skipAuthRefresh", async () => {
    let refreshRequests = 0;

    setAdapter(async (config) => {
      if (config.url === "/api/auth/refresh") {
        refreshRequests += 1;
      }
      return unauthorized(config);
    });

    await expect(
      api.get("/public/optional", { skipAuthRefresh: true })
    ).rejects.toMatchObject({ response: { status: 401 } });

    expect(refreshRequests).toBe(0);
  });

  it.each([
    ["login", 0],
    ["register", 0],
    ["logout", 0],
    ["refresh", 1],
  ])(
    "does not recursively refresh the %s endpoint",
    async (endpoint, expectedRefreshRequests) => {
      let refreshRequests = 0;

      setAdapter(async (config) => {
        if (config.url === "/api/auth/refresh") {
          refreshRequests += 1;
        }
        return unauthorized(config);
      });

      await expect(api.post(`/api/auth/${endpoint}`)).rejects.toMatchObject({
        response: { status: 401 },
      });

      expect(refreshRequests).toBe(expectedRefreshRequests);
    }
  );
});

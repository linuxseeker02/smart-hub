import axios, {
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

declare module "axios" {
  interface AxiosRequestConfig {
    skipAuthRefresh?: boolean;
  }
}

export const AUTH_STATE_INVALIDATED_EVENT = "smart-hub:auth-invalidated";

const AUTH_ENDPOINTS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/refresh",
]);

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _authRetry?: boolean;
};

let refreshPromise: Promise<void> | null = null;

const getRequestPath = (url?: string): string => {
  if (!url) return "";

  try {
    return new URL(
      url,
      typeof window === "undefined" ? "http://localhost" : window.location.origin
    ).pathname;
  } catch {
    return url.split("?")[0];
  }
};

const isAuthEndpoint = (url?: string): boolean =>
  AUTH_ENDPOINTS.has(getRequestPath(url));

const notifyAuthInvalidated = (): void => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_STATE_INVALIDATED_EVENT));
  }
};

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
    delete config.headers["content-type"];
  } else {
    config.headers["Content-Type"] = "application/json";
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableRequestConfig | undefined;

    if (
      error.response?.status !== 401 ||
      !config ||
      config._authRetry ||
      config.skipAuthRefresh ||
      isAuthEndpoint(config.url)
    ) {
      return Promise.reject(error);
    }

    config._authRetry = true;

    if (!refreshPromise) {
      refreshPromise = api
        .post("/api/auth/refresh")
        .then(() => undefined)
        .catch((refreshError) => {
          notifyAuthInvalidated();
          throw refreshError;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    try {
      await refreshPromise;
      return api(config);
    } catch {
      return Promise.reject(error);
    }
  }
);

export default api;

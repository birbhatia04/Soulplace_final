import type {
  ApiErrorShape,
  FrappeDocument,
  ListOptions,
  Paginated
} from "../types/domain";
import {
  DEMO_MODE,
  demoCreateRecord,
  demoDeleteRecord,
  demoGetRecord,
  demoListRecords,
  demoUpdateRecord
} from "./demo";

interface FrappeEnvelope<T> {
  data?: T;
  message?: T;
  exc_type?: string;
  exception?: string;
  _server_messages?: string;
}

export const AUTH_EXPIRED_EVENT = "soulplace:auth-expired";

const configuredUrl = import.meta.env.VITE_FRAPPE_URL?.replace(/\/$/, "");
export const FRAPPE_BASE_URL = configuredUrl || "";

export class ApiError extends Error implements ApiErrorShape {
  status: number;
  code: ApiErrorShape["code"];
  details?: string[];

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.status = shape.status;
    this.code = shape.code;
    this.details = shape.details;
  }
}

function serverMessageToText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeServerMessages(raw?: string): string[] {
  if (!raw) return [];
  try {
    const outer = JSON.parse(raw) as string[];
    return outer.map((item) => {
      try {
        const parsed = JSON.parse(item) as { message?: string };
        return serverMessageToText(parsed.message ?? item);
      } catch {
        return serverMessageToText(item);
      }
    });
  } catch {
    return [serverMessageToText(raw)];
  }
}

function isExpiredSession(status: number, messages: string[]) {
  if (status === 401) return true;
  if (status !== 403) return false;
  return messages.some((message) => {
    const normalized = message.toLowerCase();
    return normalized.includes("login to access") && normalized.includes("not whitelisted");
  });
}

export function normalizeApiError(error: unknown, status = 0): ApiError {
  if (error instanceof ApiError) return error;
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const code: ApiErrorShape["code"] =
    status === 401
      ? "AUTHENTICATION"
      : status === 403
        ? "PERMISSION"
        : status === 417 || status === 422
          ? "VALIDATION"
          : status >= 500
            ? "SERVER"
            : status === 0
              ? "NETWORK"
              : "UNKNOWN";
  return new ApiError({ message, status, code });
}

let csrfToken: string | undefined;

async function getCsrfToken(): Promise<string | undefined> {
  if (csrfToken) return csrfToken;
  try {
    const response = await fetch(
      `${FRAPPE_BASE_URL}/api/method/frappe.auth.get_csrf_token`,
      { credentials: "include" }
    );
    if (!response.ok) return undefined;
    const envelope = (await response.json()) as FrappeEnvelope<string>;
    csrfToken = envelope.message;
    return csrfToken;
  } catch {
    return undefined;
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipCsrf?: boolean;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const method = options.method?.toUpperCase() ?? "GET";
  const isFormData = options.body instanceof FormData;
  const headers = new Headers(options.headers);

  if (!isFormData && options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (!["GET", "HEAD"].includes(method) && !options.skipCsrf) {
    const token = await getCsrfToken();
    if (token) headers.set("X-Frappe-CSRF-Token", token);
  }

  const timeoutController = options.signal ? undefined : new AbortController();
  const timeoutId = timeoutController
    ? window.setTimeout(() => timeoutController.abort(), 10_000)
    : undefined;
  try {
    const requestBody: BodyInit | undefined =
      options.body === undefined
        ? undefined
        : isFormData
          ? (options.body as FormData)
          : JSON.stringify(options.body);
    const response = await fetch(`${FRAPPE_BASE_URL}${path}`, {
      ...options,
      method,
      headers,
      credentials: "include",
      signal: options.signal ?? timeoutController?.signal,
      body: requestBody
    });

    const text = await response.text();
    let envelope: FrappeEnvelope<T> = {};
    if (text) {
      try {
        envelope = JSON.parse(text) as FrappeEnvelope<T>;
      } catch {
        if (!response.ok) {
          throw new ApiError({
            message: text || response.statusText,
            status: response.status,
            code: response.status >= 500 ? "SERVER" : "UNKNOWN"
          });
        }
      }
    }

    if (!response.ok) {
      const details = decodeServerMessages(envelope._server_messages);
      const sessionExpired = isExpiredSession(response.status, details);
      if (sessionExpired) {
        clearSessionTokens();
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
      throw new ApiError({
        message:
          (sessionExpired ? "Your session expired. Please sign in again." : details[0]) ||
          (envelope.exception ? serverMessageToText(envelope.exception) : "") ||
          response.statusText ||
          "Frappe request failed.",
        status: response.status,
        code:
          sessionExpired
            ? "AUTHENTICATION"
            : response.status === 403
              ? "PERMISSION"
              : response.status === 417 || response.status === 422
                ? "VALIDATION"
                : response.status >= 500
                  ? "SERVER"
                  : "UNKNOWN",
        details
      });
    }

    return (envelope.data ?? envelope.message ?? envelope) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError({
        message: "The Frappe server did not respond in time.",
        status: 0,
        code: "NETWORK"
      });
    }
    throw normalizeApiError(error);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

const resourcePath = (doctype: string, name?: string) =>
  `/api/resource/${encodeURIComponent(doctype)}${
    name ? `/${encodeURIComponent(name)}` : ""
  }`;

export async function listRecords<T extends FrappeDocument>(
  doctype: string,
  options: ListOptions<T> = {}
): Promise<Paginated<T>> {
  if (DEMO_MODE) return demoListRecords(doctype, options);
  const params = new URLSearchParams();
  if (options.fields) params.set("fields", JSON.stringify(options.fields));
  if (options.filters) params.set("filters", JSON.stringify(options.filters));
  if (options.orFilters) {
    params.set("or_filters", JSON.stringify(options.orFilters));
  }
  if (options.orderBy) params.set("order_by", options.orderBy);
  params.set("limit_start", String(options.limitStart ?? 0));
  params.set("limit_page_length", String(options.limitPageLength ?? 20));
  const data = await request<T[]>(`${resourcePath(doctype)}?${params}`);
  return { data };
}

export function getRecord<T extends FrappeDocument>(
  doctype: string,
  name: string
): Promise<T> {
  if (DEMO_MODE) return Promise.resolve(demoGetRecord<T>(doctype, name));
  return request<T>(resourcePath(doctype, name));
}

export function createRecord<T extends FrappeDocument>(
  doctype: string,
  payload: Omit<Partial<T>, keyof FrappeDocument>
): Promise<T> {
  if (DEMO_MODE) {
    return Promise.resolve(demoCreateRecord<T>(doctype, payload));
  }
  return request<T>(resourcePath(doctype), {
    method: "POST",
    body: payload
  });
}

export function updateRecord<T extends FrappeDocument>(
  doctype: string,
  name: string,
  payload: Partial<T>
): Promise<T> {
  if (DEMO_MODE) {
    return Promise.resolve(demoUpdateRecord<T>(doctype, name, payload));
  }
  return request<T>(resourcePath(doctype, name), {
    method: "PUT",
    body: payload
  });
}

export function deleteRecord(doctype: string, name: string): Promise<void> {
  if (DEMO_MODE) {
    demoDeleteRecord(doctype, name);
    return Promise.resolve();
  }
  return request<void>(resourcePath(doctype, name), { method: "DELETE" });
}

export function callRpc<T>(
  method: string,
  args: Record<string, unknown> = {},
  allowGuest = false
): Promise<T> {
  return request<T>(`/api/method/${method}`, {
    method: "POST",
    body: args,
    skipCsrf: allowGuest
  });
}

export async function uploadFile(
  file: File,
  isPrivate = true
): Promise<{ file_url: string; name: string }> {
  if (DEMO_MODE) {
    return {
      file_url: `#demo-file-${encodeURIComponent(file.name)}`,
      name: file.name
    };
  }
  const body = new FormData();
  body.append("file", file);
  body.append("is_private", isPrivate ? "1" : "0");
  return request("/api/method/upload_file", { method: "POST", body });
}

export function clearSessionTokens() {
  csrfToken = undefined;
}

export function absoluteFrappeUrl(path?: string) {
  if (!path || /^(https?:|#)/i.test(path)) return path || "";
  return `${FRAPPE_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

const endpoint = import.meta.env.VITE_ERROR_REPORTING_URL?.trim();

export function reportClientError(error: unknown, context = "runtime") {
  if (!endpoint) return;
  const normalized = error instanceof Error ? error : new Error(String(error));
  const payload = JSON.stringify({
    context,
    name: normalized.name,
    message: normalized.message.slice(0, 1000),
    path: window.location.pathname,
    release: import.meta.env.VITE_APP_RELEASE || "unknown",
    occurredAt: new Date().toISOString()
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
    return;
  }
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true
  }).catch(() => undefined);
}

export function initializeMonitoring() {
  window.addEventListener("error", (event) => reportClientError(event.error || event.message, "window.error"));
  window.addEventListener("unhandledrejection", (event) => reportClientError(event.reason, "unhandledrejection"));
}

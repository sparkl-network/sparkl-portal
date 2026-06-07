import {
  type SubscribeCredentials,
  type TelemetryEvent,
} from "@/lib/router/telemetry";

const CREDENTIAL_BUFFER_SECS = 60;
const INITIAL_RECONNECT_MS = 5_000;
const MAX_RECONNECT_MS = 120_000;
const RATE_LIMIT_BACKOFF_MS = 60_000;

export type RouterTelemetryListener = {
  onEvent: (event: TelemetryEvent) => void;
  onConnectionChange: (connected: boolean, error: string | null) => void;
};

type HubListener = RouterTelemetryListener;

let listeners = new Set<HubListener>();
let ws: WebSocket | null = null;
let cachedCreds: SubscribeCredentials | null = null;
let fetchPromise: Promise<SubscribeCredentials> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectInFlight = false;
let reconnectDelayMs = INITIAL_RECONNECT_MS;
let subscribeBlockedUntil = 0;
let serviceActive = false;

function credentialsValid(creds: SubscribeCredentials): boolean {
  const now = Math.floor(Date.now() / 1000);
  return creds.exp > now + CREDENTIAL_BUFFER_SECS;
}

function notifyConnection(connected: boolean, error: string | null) {
  for (const listener of listeners) {
    listener.onConnectionChange(connected, error);
  }
}

function dispatchEvent(event: TelemetryEvent) {
  for (const listener of listeners) {
    listener.onEvent(event);
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function closeSocket() {
  if (!ws) return;
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
  ws.close();
  ws = null;
}

function teardownConnection() {
  clearReconnectTimer();
  closeSocket();
  connectInFlight = false;
}

function scheduleReconnect(delayMs: number) {
  clearReconnectTimer();
  if (!serviceActive) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureConnected();
  }, delayMs);
}

async function fetchSubscribeCredentials(): Promise<SubscribeCredentials> {
  if (Date.now() < subscribeBlockedUntil) {
    throw new Error("Too many telemetry subscribe requests. Try again shortly.");
  }

  const res = await fetch("/api/router-telemetry/subscribe", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: string }).error)
        : `Subscribe failed (${res.status})`;
    if (res.status === 429) {
      subscribeBlockedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
    }
    throw new Error(msg);
  }

  const creds = (await res.json()) as SubscribeCredentials;
  cachedCreds = creds;
  reconnectDelayMs = INITIAL_RECONNECT_MS;
  return creds;
}

async function getSubscribeCredentials(): Promise<SubscribeCredentials> {
  if (cachedCreds && credentialsValid(cachedCreds)) {
    return cachedCreds;
  }
  if (!fetchPromise) {
    fetchPromise = fetchSubscribeCredentials().finally(() => {
      fetchPromise = null;
    });
  }
  return fetchPromise;
}

async function ensureConnected() {
  if (!serviceActive) return;
  if (
    connectInFlight ||
    ws?.readyState === WebSocket.OPEN ||
    ws?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }

  connectInFlight = true;
  try {
    const creds = await getSubscribeCredentials();
    if (!serviceActive) return;

    const url = new URL(creds.wsUrl);
    url.searchParams.set("exp", String(creds.exp));
    const socket = new WebSocket(url.toString());
    ws = socket;

    socket.onopen = () => {
      reconnectDelayMs = INITIAL_RECONNECT_MS;
      notifyConnection(true, null);
    };

    socket.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data as string) as TelemetryEvent;
        dispatchEvent(event);
      } catch {
        /* ignore malformed frames */
      }
    };

    socket.onclose = () => {
      if (ws !== socket) return;
      ws = null;
      notifyConnection(false, null);
      const delay = reconnectDelayMs;
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_MS);
      scheduleReconnect(delay);
    };

    socket.onerror = () => {
      notifyConnection(false, "Telemetry WebSocket error");
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Telemetry subscribe failed";
    notifyConnection(false, message);
    const delay = message.includes("Too many telemetry subscribe")
      ? RATE_LIMIT_BACKOFF_MS
      : reconnectDelayMs;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_MS);
    scheduleReconnect(delay);
  } finally {
    connectInFlight = false;
  }
}

/** Start the shared router telemetry WebSocket (idempotent). */
export function startRouterTelemetryService(): void {
  serviceActive = true;
  void ensureConnected();
}

/** Stop the shared WebSocket; cached subscribe credentials are retained for quick restart. */
export function stopRouterTelemetryService(): void {
  serviceActive = false;
  teardownConnection();
}

export function subscribeRouterTelemetryHub(listener: HubListener): () => void {
  listeners.add(listener);
  if (serviceActive) {
    void ensureConnected();
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper */
export function resetTelemetryHubForTests(): void {
  serviceActive = false;
  listeners.clear();
  teardownConnection();
  cachedCreds = null;
  fetchPromise = null;
  subscribeBlockedUntil = 0;
  reconnectDelayMs = INITIAL_RECONNECT_MS;
}

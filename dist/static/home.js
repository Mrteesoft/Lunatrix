import { buildBackendUrl, buildBackendWebSocketUrl } from "./api-base.js";

const liveSymbol = document.querySelector("#hero-live-symbol");
const liveAction = document.querySelector("#hero-live-action");
const livePrice = document.querySelector("#hero-live-price");
const liveConfidence = document.querySelector("#hero-live-confidence");
const liveSummary = document.querySelector("#hero-live-summary");
const liveConnection = document.querySelector("#hero-live-connection");
const liveTimestamp = document.querySelector("#hero-live-timestamp");
const liveChart = document.querySelector("#hero-live-chart");
const holdMonitorGrid = document.querySelector("#hold-monitor-grid");
const heroCanvas = document.querySelector("#hero-canvas");
const header = document.querySelector(".mistral-header");
const menuToggle = document.querySelector(".mistral-menu-toggle");

const reconnectDelayMs = 4000;
const tradingViewScriptUrl = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
const placeholderProductIds = new Set(["ASSET-USD", "SIGNAL-USD"]);
const tradingViewSymbolOverrides = new Map([
  ["BTC-USD", "COINBASE:BTCUSD"],
  ["ETH-USD", "COINBASE:ETHUSD"],
  ["SOL-USD", "COINBASE:SOLUSD"],
  ["LINK-USD", "COINBASE:LINKUSD"],
  ["AVAX-USD", "COINBASE:AVAXUSD"],
  ["ARB-USD", "COINBASE:ARBUSD"],
]);

const state = {
  activeSocket: null,
  reconnectTimer: null,
  snapshot: null,
  selectedProductId: null,
  activeTradingViewSymbol: null,
};

function setMobileMenuOpen(isOpen) {
  if (!(header instanceof HTMLElement) || !(menuToggle instanceof HTMLButtonElement)) {
    return;
  }

  header.classList.toggle("is-menu-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
}

if (menuToggle instanceof HTMLButtonElement) {
  menuToggle.addEventListener("click", () => {
    setMobileMenuOpen(!header?.classList.contains("is-menu-open"));
  });
}

if (header instanceof HTMLElement) {
  header.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLAnchorElement && window.matchMedia("(max-width: 760px)").matches) {
      setMobileMenuOpen(false);
    }
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMobileMenuOpen(false);
  }
});

window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 760px)").matches) {
    setMobileMenuOpen(false);
  }
});

function seededNoise(seed) {
  let value = seed % 2147483647;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function buildRidgeline(width, baseline, amplitude, points, seed) {
  const random = seededNoise(seed);
  const line = [];
  for (let index = 0; index <= points; index += 1) {
    const x = (index / points) * width;
    const wave =
      Math.sin(index * 0.72 + seed) * amplitude * 0.35 +
      Math.sin(index * 0.23 + seed * 0.4) * amplitude * 0.42;
    const jitter = (random() - 0.5) * amplitude * 0.52;
    line.push([x, baseline + wave + jitter]);
  }
  return line;
}

function drawMountainLayer(context, width, height, options) {
  const ridge = buildRidgeline(
    width,
    height * options.baseline,
    height * options.amplitude,
    options.points,
    options.seed,
  );

  const gradient = context.createLinearGradient(0, height * options.top, 0, height);
  gradient.addColorStop(0, options.colorTop);
  gradient.addColorStop(1, options.colorBottom);

  context.beginPath();
  context.moveTo(0, height);
  ridge.forEach(([x, y]) => context.lineTo(x, y));
  context.lineTo(width, height);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();
}

function drawHeroCanvas() {
  if (!(heroCanvas instanceof HTMLCanvasElement)) {
    return;
  }

  const rect = heroCanvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  heroCanvas.width = Math.floor(width * ratio);
  heroCanvas.height = Math.floor(height * ratio);

  const context = heroCanvas.getContext("2d");
  if (!context) {
    return;
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#dca900");
  sky.addColorStop(0.36, "#e7a000");
  sky.addColorStop(0.7, "#df7800");
  sky.addColorStop(1, "#cf5b00");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(
    width * 0.52,
    height * 0.43,
    0,
    width * 0.52,
    height * 0.43,
    width * 0.44,
  );
  glow.addColorStop(0, "rgba(255, 222, 52, 0.52)");
  glow.addColorStop(0.42, "rgba(255, 199, 28, 0.2)");
  glow.addColorStop(1, "rgba(255, 199, 28, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  drawMountainLayer(context, width, height, {
    baseline: 0.58,
    amplitude: 0.07,
    points: 72,
    seed: 11,
    top: 0.4,
    colorTop: "rgba(184, 104, 0, 0.28)",
    colorBottom: "rgba(184, 87, 0, 0.08)",
  });

  drawMountainLayer(context, width, height, {
    baseline: 0.68,
    amplitude: 0.11,
    points: 64,
    seed: 23,
    top: 0.5,
    colorTop: "rgba(151, 73, 0, 0.4)",
    colorBottom: "rgba(131, 55, 0, 0.16)",
  });

  drawMountainLayer(context, width, height, {
    baseline: 0.82,
    amplitude: 0.12,
    points: 46,
    seed: 37,
    top: 0.64,
    colorTop: "rgba(110, 42, 0, 0.58)",
    colorBottom: "rgba(82, 25, 0, 0.34)",
  });

  const haze = context.createLinearGradient(0, height * 0.46, width, height);
  haze.addColorStop(0, "rgba(255,255,255,0)");
  haze.addColorStop(0.58, "rgba(255,214,96,0.18)");
  haze.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = haze;
  context.fillRect(0, height * 0.45, width, height * 0.5);
}

function syncHeaderScrollState() {
  document.body.classList.toggle("is-scrolled", window.scrollY > 24);
}

syncHeaderScrollState();
window.addEventListener("scroll", syncHeaderScrollState, { passive: true });
drawHeroCanvas();
window.addEventListener("resize", drawHeroCanvas, { passive: true });

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }

  const numericValue = Number(value);
  const maximumFractionDigits =
    numericValue >= 1000 ? 2 :
    numericValue >= 1 ? 4 :
    numericValue >= 0.01 ? 5 :
    6;

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(numericValue);
}

function formatDate(value) {
  if (!value) {
    return "Waiting for live snapshot";
  }

  const normalizedValue = String(value).replace(" ", "T");
  const parsedDate = new Date(normalizedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return String(value);
  }

  return parsedDate.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sentenceCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setConnectionState(stateName, label) {
  if (!liveConnection || !liveTimestamp) {
    return;
  }

  liveConnection.className = "live-connection-dot";
  liveConnection.classList.add(`is-${stateName}`);
  liveTimestamp.textContent = label;
}

function setPrimaryAction(actionValue, signalName) {
  if (!liveAction) {
    return;
  }

  const normalizedAction = String(actionValue || "").trim().toLowerCase() || "pending";
  liveAction.className = "live-signal-action";
  liveAction.classList.add(`is-${normalizedAction}`);
  liveAction.textContent = signalName || sentenceCase(normalizedAction);
}

function normalizeProductId(signal) {
  return String(signal?.productId || signal?.pairSymbol || "").toUpperCase().trim();
}

function hasUsableTradingViewProduct(signal) {
  const productId = normalizeProductId(signal);
  return Boolean(productId) && !placeholderProductIds.has(productId) && /^([A-Z0-9]+)-([A-Z0-9]+)$/u.test(productId);
}

function isBuySignal(signal) {
  const action = String(signal?.spotAction || "").trim().toLowerCase();
  const signalName = String(signal?.signalName || signal?.signal_name || "").trim().toUpperCase();
  return action === "buy" || signalName === "BUY";
}

function isHoldSignal(signal) {
  const action = String(signal?.spotAction || "").trim().toLowerCase();
  const signalName = String(signal?.signalName || signal?.signal_name || "").trim().toUpperCase();
  return action === "hold" || action === "wait" || signalName === "HOLD";
}

function buildTradingViewSymbol(signal) {
  const rawProductId = normalizeProductId(signal);
  const overrideSymbol = tradingViewSymbolOverrides.get(rawProductId);
  if (overrideSymbol) {
    return overrideSymbol;
  }

  return "COINBASE:BTCUSD";
}

function resolveActiveSignal(snapshot) {
  const signals = Array.isArray(snapshot?.signals) ? snapshot.signals : [];
  const primarySignal = snapshot?.primarySignal || signals[0] || null;
  const buySignal =
    signals.find((signal) => isBuySignal(signal) && hasUsableTradingViewProduct(signal)) ||
    (isBuySignal(primarySignal) && hasUsableTradingViewProduct(primarySignal) ? primarySignal : null);
  const fallbackSignal = buySignal || signals.find(hasUsableTradingViewProduct) || primarySignal;

  if (!primarySignal) {
    return null;
  }

  if (!state.selectedProductId) {
    state.selectedProductId = fallbackSignal?.productId || primarySignal.productId;
    return fallbackSignal || primarySignal;
  }

  if (primarySignal.productId === state.selectedProductId) {
    return primarySignal;
  }

  const matchedSignal = signals.find((signal) => signal.productId === state.selectedProductId) || null;
  if (matchedSignal) {
    return matchedSignal;
  }

  state.selectedProductId = fallbackSignal?.productId || primarySignal.productId;
  return fallbackSignal || primarySignal;
}

function renderTradingViewWidget(signal) {
  if (!liveChart) {
    return;
  }

  const tradingViewSymbol = buildTradingViewSymbol(signal);
  if (state.activeTradingViewSymbol === tradingViewSymbol && liveChart.querySelector("iframe")) {
    return;
  }

  state.activeTradingViewSymbol = tradingViewSymbol;

  liveChart.innerHTML = `
    <div class="tradingview-widget-container hero-tradingview-widget">
      <div class="tradingview-widget-container__widget"></div>
    </div>
  `;

  const widgetHost = liveChart.querySelector(".hero-tradingview-widget");
  if (!widgetHost) {
    return;
  }

  const widgetScript = document.createElement("script");
  widgetScript.type = "text/javascript";
  widgetScript.async = true;
  widgetScript.src = tradingViewScriptUrl;
  widgetScript.textContent = JSON.stringify({
    autosize: true,
    symbol: tradingViewSymbol,
    interval: "60",
    timezone: "Etc/UTC",
    theme: "light",
    style: "1",
    locale: "en",
    allow_symbol_change: false,
    hide_top_toolbar: false,
    hide_side_toolbar: false,
    withdateranges: false,
    save_image: false,
    calendar: false,
    studies: ["Volume@tv-basicstudies"],
    support_host: "https://www.tradingview.com",
  });
  widgetHost.append(widgetScript);
}

function renderHoldMonitors(signals) {
  if (!(holdMonitorGrid instanceof HTMLElement)) {
    return;
  }

  const holdSignals = signals
    .filter((signal) => isHoldSignal(signal) && normalizeProductId(signal) && !placeholderProductIds.has(normalizeProductId(signal)))
    .slice(0, 18);

  if (!holdSignals.length) {
    holdMonitorGrid.innerHTML = '<article class="hold-monitor-empty">No HOLD coins are currently published by the model.</article>';
    return;
  }

  holdMonitorGrid.innerHTML = holdSignals
    .map((signal) => {
      const productId = signal.productId || signal.pairSymbol || "Unknown";
      const confidence = formatPercent(signal.confidence);
      const price = formatPrice(signal.close);
      const summary =
        signal.brainSummary ||
        signal.reasonSummary ||
        signal.explanationSummary ||
        "Monitoring until the model sees a stronger directional edge.";

      return `
        <article class="hold-monitor-card">
          <div class="hold-monitor-card-top">
            <div>
              <strong>${escapeHtml(productId)}</strong>
              <span>${escapeHtml(signal.symbol || signal.signalName || "HOLD")}</span>
            </div>
            <span class="hold-monitor-pill">Hold</span>
          </div>
          <p>${escapeHtml(summary)}</p>
          <div class="hold-monitor-metrics">
            <span><small>Confidence</small>${confidence}</span>
            <span><small>Last price</small>${price}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadHoldMonitorsFromApi() {
  if (!(holdMonitorGrid instanceof HTMLElement)) {
    return;
  }

  try {
    for (const actionName of ["hold", "wait"]) {
      const response = await fetch(buildBackendUrl(`/api/current-signals?action=${actionName}&limit=24`), {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      const signals = Array.isArray(payload?.signals) ? payload.signals : [];
      if (signals.length > 0) {
        renderHoldMonitors(signals);
        return;
      }
    }
  } catch {
    // The websocket/live snapshot render remains the fallback.
  }
}

function renderSnapshot(snapshot) {
  state.snapshot = snapshot;
  const activeSignal = resolveActiveSignal(snapshot);
  renderHoldMonitors(Array.isArray(snapshot?.signals) ? snapshot.signals : []);

  if (!activeSignal) {
    setConnectionState("offline", "No public signal available");
    if (liveSummary) {
      liveSummary.textContent =
        "No public trade-ready signal is published right now. Candidates remain on the internal watchlist until a BUY appears or an open trade needs management.";
    }
    return;
  }

  if (liveSymbol) {
    liveSymbol.textContent = activeSignal.pairSymbol || activeSignal.productId || "Live signal";
  }

  setPrimaryAction(activeSignal.spotAction, activeSignal.signalName);

  if (livePrice) {
    livePrice.textContent = formatPrice(activeSignal.close);
  }

  if (liveConfidence) {
    const changeSuffix =
      activeSignal.changePct !== null && activeSignal.changePct !== undefined
        ? ` - ${Number(activeSignal.changePct).toFixed(2)}% move`
        : "";
    liveConfidence.textContent = `${formatPercent(activeSignal.confidence)} confidence${changeSuffix}`;
  }

  if (liveSummary) {
    liveSummary.textContent =
      activeSignal.brainSummary ||
      activeSignal.reasonSummary ||
      "Live snapshot is connected through the backend gateway.";
  }

  setConnectionState("live", `Live snapshot ${formatDate(snapshot?.generatedAt || activeSignal.timestamp)}`);
  renderTradingViewWidget(activeSignal);
}

async function loadHttpFallback() {
  try {
    const response = await fetch(buildBackendUrl("/api/live/snapshot?force_refresh=false"), {
      headers: { Accept: "application/json" },
    }).catch(() => null);
    const snapshotPayload = response && response.ok ? await response.json() : null;

    if (snapshotPayload) {
      renderSnapshot(snapshotPayload);
      return;
    }
  } catch {
    // Fall through to the current published signal path below.
  }

  try {
    const response = await fetch(buildBackendUrl("/api/current-snapshot"), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    renderSnapshot(payload);
  } catch (error) {
    setConnectionState("offline", "Backend gateway unavailable");
    if (liveSummary) {
      liveSummary.textContent = error instanceof Error ? error.message : String(error);
    }
    if (liveChart) {
      liveChart.innerHTML = '<div class="hero-live-chart-placeholder">TradingView chart unavailable</div>';
    }
  }
}

function scheduleReconnect() {
  if (state.reconnectTimer !== null) {
    return;
  }

  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    connectLiveSignalStream();
  }, reconnectDelayMs);
}

function connectLiveSignalStream() {
  if (!liveSymbol || !liveAction || !liveChart) {
    return;
  }

  if (state.activeSocket !== null) {
    state.activeSocket.close();
    state.activeSocket = null;
  }

  const websocketPath = document.body?.dataset?.liveSignalWsPath || "/ws/live-signals";
  const websocketUrl = buildBackendWebSocketUrl(websocketPath);
  setConnectionState("pending", "Connecting to backend gateway");

  const socket = new WebSocket(websocketUrl);
  state.activeSocket = socket;

  socket.addEventListener("open", () => {
    setConnectionState("pending", "Waiting for first backend snapshot");
  });

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(String(event.data));
      if (payload?.type === "error") {
        throw new Error(payload.message || "Live snapshot failed");
      }

      renderSnapshot(payload);
    } catch (error) {
      setConnectionState("offline", "Live stream error");
      if (liveSummary) {
        liveSummary.textContent = error instanceof Error ? error.message : String(error);
      }
    }
  });

  socket.addEventListener("error", () => {
    setConnectionState("offline", "Websocket unavailable, using HTTP fallback");
    void loadHttpFallback();
  });

  socket.addEventListener("close", () => {
    if (state.activeSocket === socket) {
      state.activeSocket = null;
    }

    scheduleReconnect();
  });
}

connectLiveSignalStream();
void loadHoldMonitorsFromApi();

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
const buyTrackerStorageKey = "lunatrix.buySignalTracker.v1";
const performancePickStorageKey = "lunatrix.performancePick.v1";
const buyTrackerWindowMs = 24 * 60 * 60 * 1000;
const performancePickWindowMs = 24 * 60 * 60 * 1000;
const buyTrackerHistoryLimit = 12;
const performancePickHistoryLimit = 12;
const buyReselectionCooldownMs = 24 * 60 * 60 * 1000;
const minimumBuyPerformancePct = 0;
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
  activeTradingViewSymbol: null,
  buyTracker: loadBuyTrackerState(),
  performancePick: loadPerformancePickState(),
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

function createEmptyBuyTrackerState() {
  return {
    active: null,
    history: [],
  };
}

function loadBuyTrackerState() {
  const emptyState = createEmptyBuyTrackerState();

  try {
    const rawValue = window.localStorage?.getItem(buyTrackerStorageKey);
    if (!rawValue) {
      return emptyState;
    }

    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object") {
      return emptyState;
    }

    const activeProductId = normalizeProductId(parsedValue.active);
    const active = activeProductId
      ? {
          ...parsedValue.active,
          productId: activeProductId,
        }
      : null;
    const history = Array.isArray(parsedValue.history)
      ? parsedValue.history
          .filter((entry) => normalizeProductId(entry))
          .slice(0, buyTrackerHistoryLimit)
      : [];

    return {
      active,
      history,
    };
  } catch {
    return emptyState;
  }
}

function saveBuyTrackerState() {
  try {
    window.localStorage?.setItem(
      buyTrackerStorageKey,
      JSON.stringify({
        active: state.buyTracker.active,
        history: state.buyTracker.history.slice(0, buyTrackerHistoryLimit),
      }),
    );
  } catch {
    // Local storage can be unavailable in private or embedded browsing contexts.
  }
}

function createEmptyPerformancePickState() {
  return {
    active: null,
    history: [],
  };
}

function loadPerformancePickState() {
  const emptyState = createEmptyPerformancePickState();

  try {
    const rawValue = window.localStorage?.getItem(performancePickStorageKey);
    if (!rawValue) {
      return emptyState;
    }

    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object") {
      return emptyState;
    }

    const activeProductId = normalizeProductId(parsedValue.active);
    const active = activeProductId
      ? {
          ...parsedValue.active,
          productId: activeProductId,
        }
      : null;
    const history = Array.isArray(parsedValue.history)
      ? parsedValue.history
          .filter((entry) => normalizeProductId(entry))
          .slice(0, performancePickHistoryLimit)
      : [];

    return {
      active,
      history,
    };
  } catch {
    return emptyState;
  }
}

function savePerformancePickState() {
  try {
    window.localStorage?.setItem(
      performancePickStorageKey,
      JSON.stringify({
        active: state.performancePick.active,
        history: state.performancePick.history.slice(0, performancePickHistoryLimit),
      }),
    );
  } catch {
    // Local storage can be unavailable in private or embedded browsing contexts.
  }
}

function parseTimestampMs(value) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getTime();
}

function toIsoTimestamp(value, fallbackMs = Date.now()) {
  const parsedMs = parseTimestampMs(value);
  return new Date(parsedMs ?? fallbackMs).toISOString();
}

function getSignalPrice(signal) {
  const numericValue = Number(signal?.close ?? signal?.price ?? signal?.entryPrice);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function calculateReturnPct(entryPrice, currentPrice) {
  if (!entryPrice || !currentPrice) {
    return null;
  }

  return ((currentPrice - entryPrice) / entryPrice) * 100;
}

function formatSignedPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  const numericValue = Number(value);
  const sign = numericValue > 0 ? "+" : "";
  return `${sign}${numericValue.toFixed(2)}%`;
}

function formatTimeRemaining(milliseconds) {
  if (milliseconds === null || milliseconds === undefined || Number.isNaN(Number(milliseconds))) {
    return "Awaiting outcome";
  }

  const clampedMs = Math.max(Number(milliseconds), 0);
  if (clampedMs <= 0) {
    return "Review due";
  }

  const totalMinutes = Math.ceil(clampedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m left`;
  }

  return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`;
}

function normalizeProductId(signal) {
  return String(signal?.productId || signal?.pairSymbol || "").toUpperCase().trim();
}

function collectSnapshotSignals(snapshot) {
  const rawSignals = [];
  if (snapshot?.coinOfTheDay) {
    rawSignals.push(snapshot.coinOfTheDay);
  }
  if (snapshot?.marketSummary?.coinOfTheDay) {
    rawSignals.push(snapshot.marketSummary.coinOfTheDay);
  }
  if (Array.isArray(snapshot?.spotlightCandidates)) {
    rawSignals.push(...snapshot.spotlightCandidates);
  }
  if (Array.isArray(snapshot?.marketSummary?.spotlightCandidates)) {
    rawSignals.push(...snapshot.marketSummary.spotlightCandidates);
  }
  if (snapshot?.primarySignal) {
    rawSignals.push(snapshot.primarySignal);
  }
  if (Array.isArray(snapshot?.signals)) {
    rawSignals.push(...snapshot.signals);
  }
  if (Array.isArray(snapshot?.actionableSignals)) {
    rawSignals.push(...snapshot.actionableSignals);
  }
  if (Array.isArray(snapshot?.topBuys)) {
    rawSignals.push(...snapshot.topBuys);
  }

  const seenProductIds = new Set();
  return rawSignals.filter((signal) => {
    const productId = normalizeProductId(signal);
    if (!productId || seenProductIds.has(productId)) {
      return false;
    }

    seenProductIds.add(productId);
    return true;
  });
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

function getSignalName(signal) {
  return String(signal?.signalName || signal?.signal_name || "HOLD").trim().toUpperCase();
}

function buildTradingViewSymbol(signal) {
  const rawProductId = normalizeProductId(signal);
  const overrideSymbol = tradingViewSymbolOverrides.get(rawProductId);
  if (overrideSymbol) {
    return overrideSymbol;
  }

  const productMatch = rawProductId.match(/^([A-Z0-9]+)-([A-Z0-9]+)$/u);
  if (productMatch) {
    const [, baseSymbol, quoteSymbol] = productMatch;
    if (quoteSymbol === "USDT") {
      return `BINANCE:${baseSymbol}USDT`;
    }
    if (quoteSymbol === "USD") {
      return `COINBASE:${baseSymbol}USD`;
    }
    return `BINANCE:${baseSymbol}${quoteSymbol}`;
  }

  return "COINBASE:BTCUSD";
}

function resolveBuyCandidates(snapshot) {
  return collectSnapshotSignals(snapshot)
    .filter((signal) => isBuySignal(signal) && hasUsableTradingViewProduct(signal));
}

function getSpotlightScore(signal) {
  const explicitScore = Number(signal?.coinOfDayScore ?? signal?.spotlightScore);
  if (Number.isFinite(explicitScore)) {
    return explicitScore > 1 ? explicitScore : explicitScore * 100;
  }

  const brainScore = Number(signal?.brain?.decisionScore);
  if (Number.isFinite(brainScore)) {
    return brainScore > 1 ? brainScore : brainScore * 100;
  }

  const confidence = Number(signal?.confidence);
  return Number.isFinite(confidence) ? confidence * 100 : 0;
}

function formatScore(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "-";
  }

  return `${Math.round(Math.max(numericValue, 0))}/100`;
}

function resolveSpotlightLabel(signal) {
  const explicitLabel = String(signal?.spotlightLabel || "").trim();
  if (explicitLabel) {
    return explicitLabel;
  }

  return isBuySignal(signal) ? "Signal coin" : "Coin of the day";
}

function summarizeSpotlight(signal) {
  return (
    signal?.spotlightReason ||
    signal?.brainSummary ||
    signal?.reasonSummary ||
    signal?.explanationSummary ||
    signal?.signalChat ||
    "This is the strongest watch candidate while the live BUY gate remains closed."
  );
}

function resolveSpotlightCandidates(snapshot) {
  return collectSnapshotSignals(snapshot)
    .filter((signal) => hasUsableTradingViewProduct(signal))
    .sort((leftSignal, rightSignal) => {
      const scoreDelta = getSpotlightScore(rightSignal) - getSpotlightScore(leftSignal);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return normalizeProductId(leftSignal).localeCompare(normalizeProductId(rightSignal));
    });
}

function resolveSpotlightSignal(snapshot) {
  const explicitSpotlight = snapshot?.coinOfTheDay || snapshot?.marketSummary?.coinOfTheDay;
  if (explicitSpotlight && hasUsableTradingViewProduct(explicitSpotlight)) {
    return explicitSpotlight;
  }

  return resolveSpotlightCandidates(snapshot)[0] || null;
}

function wasRecentlyClosedBuy(productId, history) {
  if (!productId) {
    return false;
  }

  const nowMs = Date.now();
  return history.some((entry) => {
    if (normalizeProductId(entry) !== productId) {
      return false;
    }

    const closedAtMs = parseTimestampMs(entry.closedAt);
    return closedAtMs !== null && nowMs - closedAtMs < buyReselectionCooldownMs;
  });
}

function summarizeSignal(signal) {
  return (
    signal?.brainSummary ||
    signal?.reasonSummary ||
    signal?.explanationSummary ||
    signal?.signalChat ||
    "BUY setup is being tracked for a 24-hour outcome."
  );
}

function createTrackedBuy(signal, snapshot) {
  const startedAtMs = Date.now();
  const productId = normalizeProductId(signal);

  return {
    productId,
    pairSymbol: signal.pairSymbol || signal.productId || productId,
    symbol: signal.symbol || productId.replace(/-USD$/u, ""),
    entryPrice: getSignalPrice(signal),
    entryConfidence: Number(signal.confidence || 0),
    startedAt: new Date(startedAtMs).toISOString(),
    dueAt: new Date(startedAtMs + buyTrackerWindowMs).toISOString(),
    signalTimestamp: toIsoTimestamp(signal.timestamp || signal.generatedAt || snapshot?.generatedAt, startedAtMs),
    summary: summarizeSignal(signal),
    awaitingOutcome: false,
  };
}

function createTrackedPerformancePick(signal, snapshot) {
  const startedAtMs = Date.now();
  const productId = normalizeProductId(signal);

  return {
    productId,
    pairSymbol: signal.pairSymbol || signal.productId || productId,
    symbol: signal.symbol || productId.replace(/-USD$/u, ""),
    entryPrice: getSignalPrice(signal),
    entryConfidence: Number(signal.confidence || 0),
    entryScore: getSpotlightScore(signal),
    startedAt: new Date(startedAtMs).toISOString(),
    dueAt: new Date(startedAtMs + performancePickWindowMs).toISOString(),
    signalTimestamp: toIsoTimestamp(signal.timestamp || signal.generatedAt || snapshot?.generatedAt, startedAtMs),
    signalName: getSignalName(signal),
    summary: summarizeSpotlight(signal),
    awaitingOutcome: false,
  };
}

function buildTrackedDisplaySignal(activeBuy, latestSignal) {
  const latestPrice = getSignalPrice(latestSignal) ?? activeBuy.entryPrice;
  const returnPct = calculateReturnPct(activeBuy.entryPrice, latestPrice);
  const dueAtMs = parseTimestampMs(activeBuy.dueAt);
  const timeRemainingMs = dueAtMs === null ? null : Math.max(dueAtMs - Date.now(), 0);

  return {
    ...(latestSignal || {}),
    productId: activeBuy.productId,
    pairSymbol: activeBuy.pairSymbol || activeBuy.productId,
    symbol: activeBuy.symbol || activeBuy.productId.replace(/-USD$/u, ""),
    close: latestPrice,
    confidence: activeBuy.entryConfidence,
    signalName: "BUY",
    signal_name: "BUY",
    spotAction: "buy",
    timestamp: activeBuy.signalTimestamp,
    brainSummary: activeBuy.summary,
    changePct: returnPct,
    tracking: {
      entryPrice: activeBuy.entryPrice,
      startedAt: activeBuy.startedAt,
      dueAt: activeBuy.dueAt,
      returnPct,
      timeRemainingMs,
      awaitingOutcome: Boolean(activeBuy.awaitingOutcome),
    },
  };
}

function buildPerformancePickDisplaySignal(activePick, latestSignal) {
  const latestPrice = getSignalPrice(latestSignal) ?? activePick.entryPrice;
  const returnPct = calculateReturnPct(activePick.entryPrice, latestPrice);
  const dueAtMs = parseTimestampMs(activePick.dueAt);
  const timeRemainingMs = dueAtMs === null ? null : Math.max(dueAtMs - Date.now(), 0);

  return {
    ...(latestSignal || {}),
    productId: activePick.productId,
    pairSymbol: activePick.pairSymbol || activePick.productId,
    symbol: activePick.symbol || activePick.productId.replace(/-USD$/u, ""),
    close: latestPrice,
    confidence: activePick.entryConfidence,
    signalName: activePick.signalName || getSignalName(latestSignal),
    signal_name: activePick.signalName || getSignalName(latestSignal),
    spotAction: "watch",
    spotlightLabel: "Performance pick",
    timestamp: activePick.signalTimestamp,
    brainSummary: activePick.summary,
    changePct: returnPct,
    pick: {
      entryPrice: activePick.entryPrice,
      startedAt: activePick.startedAt,
      dueAt: activePick.dueAt,
      returnPct,
      timeRemainingMs,
      awaitingOutcome: Boolean(activePick.awaitingOutcome),
      score: activePick.entryScore,
    },
  };
}

function closeTrackedBuy(activeBuy, latestSignal, returnPct) {
  const exitPrice = getSignalPrice(latestSignal);
  const performedWell = Number(returnPct) >= minimumBuyPerformancePct;

  return {
    ...activeBuy,
    closedAt: new Date().toISOString(),
    exitPrice,
    returnPct,
    outcome: performedWell ? "performed" : "underperformed",
  };
}

function closeTrackedPerformancePick(activePick, latestSignal, returnPct) {
  const exitPrice = getSignalPrice(latestSignal);
  const performedWell = Number(returnPct) >= minimumBuyPerformancePct;

  return {
    ...activePick,
    closedAt: new Date().toISOString(),
    exitPrice,
    returnPct,
    outcome: performedWell ? "performed" : "underperformed",
  };
}

function updatePerformancePickTracking(snapshot, candidateSignal, latestSignalByProduct) {
  const tracker = state.performancePick;

  if (tracker.active) {
    const activeProductId = normalizeProductId(tracker.active);
    tracker.active.productId = activeProductId;
    const latestSignal = latestSignalByProduct.get(activeProductId) || null;
    const currentPrice = getSignalPrice(latestSignal);
    const returnPct = calculateReturnPct(tracker.active.entryPrice, currentPrice);
    const dueAtMs = parseTimestampMs(tracker.active.dueAt);
    const reviewDue = dueAtMs !== null && Date.now() >= dueAtMs;

    if (reviewDue && returnPct === null) {
      tracker.active.awaitingOutcome = true;
    } else if (reviewDue) {
      const historyEntry = closeTrackedPerformancePick(tracker.active, latestSignal, returnPct);
      tracker.history = [historyEntry, ...tracker.history].slice(0, performancePickHistoryLimit);
      tracker.active = null;
    } else {
      tracker.active.awaitingOutcome = false;
    }
  }

  const candidateProductId = normalizeProductId(candidateSignal);
  if (!tracker.active && candidateProductId && getSignalPrice(candidateSignal) !== null) {
    const recentlyClosed = tracker.history.some((entry) => {
      if (normalizeProductId(entry) !== candidateProductId) {
        return false;
      }

      const closedAtMs = parseTimestampMs(entry.closedAt);
      return closedAtMs !== null && Date.now() - closedAtMs < performancePickWindowMs;
    });

    if (!recentlyClosed) {
      tracker.active = createTrackedPerformancePick(candidateSignal, snapshot);
    }
  }

  const activeProductId = tracker.active ? normalizeProductId(tracker.active) : "";
  const latestSignal = activeProductId ? latestSignalByProduct.get(activeProductId) || null : null;
  const activePickSignal = tracker.active ? buildPerformancePickDisplaySignal(tracker.active, latestSignal) : null;

  savePerformancePickState();

  return {
    activePickSignal,
    history: tracker.history.slice(0, performancePickHistoryLimit),
  };
}

function updateBuyTracking(snapshot) {
  const tracker = state.buyTracker;
  const snapshotSignals = collectSnapshotSignals(snapshot);
  const latestSignalByProduct = new Map(
    snapshotSignals.map((signal) => [normalizeProductId(signal), signal]),
  );

  if (tracker.active) {
    const activeProductId = normalizeProductId(tracker.active);
    tracker.active.productId = activeProductId;
    const latestSignal = latestSignalByProduct.get(activeProductId) || null;
    const currentPrice = getSignalPrice(latestSignal);
    const returnPct = calculateReturnPct(tracker.active.entryPrice, currentPrice);
    const dueAtMs = parseTimestampMs(tracker.active.dueAt);
    const reviewDue = dueAtMs !== null && Date.now() >= dueAtMs;

    if (reviewDue && returnPct === null) {
      tracker.active.awaitingOutcome = true;
    } else if (reviewDue) {
      const historyEntry = closeTrackedBuy(tracker.active, latestSignal, returnPct);
      tracker.history = [historyEntry, ...tracker.history].slice(0, buyTrackerHistoryLimit);
      tracker.active = null;
    } else {
      tracker.active.awaitingOutcome = false;
    }
  }

  const buyCandidates = resolveBuyCandidates(snapshot);
  if (!tracker.active) {
    const nextCandidate = buyCandidates.find(
      (signal) => !wasRecentlyClosedBuy(normalizeProductId(signal), tracker.history),
    );
    if (nextCandidate) {
      tracker.active = createTrackedBuy(nextCandidate, snapshot);
    }
  }

  const activeProductId = tracker.active ? normalizeProductId(tracker.active) : "";
  const activeLatestSignal = activeProductId ? latestSignalByProduct.get(activeProductId) || null : null;
  const activeSignal = tracker.active ? buildTrackedDisplaySignal(tracker.active, activeLatestSignal) : null;
  const nextBuySignals = buyCandidates
    .filter((signal) => {
      const productId = normalizeProductId(signal);
      return productId !== activeProductId && !wasRecentlyClosedBuy(productId, tracker.history);
    })
    .slice(0, 5);
  const spotlightSignal = resolveSpotlightSignal(snapshot);
  const performancePickView = updatePerformancePickTracking(snapshot, spotlightSignal, latestSignalByProduct);
  const spotlightProductId = normalizeProductId(spotlightSignal);
  const nextWatchSignals = resolveSpotlightCandidates(snapshot)
    .filter((signal) => {
      const productId = normalizeProductId(signal);
      return (
        productId &&
        productId !== activeProductId &&
        productId !== spotlightProductId &&
        productId !== normalizeProductId(performancePickView.activePickSignal) &&
        !isBuySignal(signal)
      );
    })
    .slice(0, 4);

  saveBuyTrackerState();

  return {
    activeSignal,
    spotlightSignal,
    performancePickSignal: performancePickView.activePickSignal,
    nextBuySignals,
    nextWatchSignals,
    history: tracker.history.slice(0, buyTrackerHistoryLimit),
    pickHistory: performancePickView.history,
  };
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

function renderBuyTrackerPanel(trackingView) {
  if (!(holdMonitorGrid instanceof HTMLElement)) {
    return;
  }

  const cards = [];
  if (trackingView.activeSignal) {
    const signal = trackingView.activeSignal;
    const tracking = signal.tracking || {};
    const entryPrice = formatPrice(tracking.entryPrice);
    const currentPrice = formatPrice(signal.close);
    const returnPct = formatSignedPercent(tracking.returnPct);
    const reviewLabel = tracking.awaitingOutcome
      ? "Awaiting outcome price"
      : formatTimeRemaining(tracking.timeRemainingMs);

    cards.push(`
      <article class="hold-monitor-card is-active-buy">
        <div class="hold-monitor-card-top">
          <div>
            <strong>${escapeHtml(signal.productId || signal.pairSymbol || "BUY")}</strong>
            <span>${escapeHtml(signal.symbol || "Active BUY")}</span>
          </div>
          <span class="hold-monitor-pill is-active">24h track</span>
        </div>
        <p>Entry ${entryPrice}; current ${currentPrice}. This BUY stays active until the 24-hour review completes.</p>
        <div class="hold-monitor-metrics">
          <span><small>Return</small>${returnPct}</span>
          <span><small>Review</small>${escapeHtml(reviewLabel)}</span>
        </div>
      </article>
    `);
  } else if (trackingView.performancePickSignal) {
    const signal = trackingView.performancePickSignal;
    const pick = signal.pick || {};
    const entryPrice = formatPrice(pick.entryPrice);
    const currentPrice = formatPrice(signal.close);
    const returnPct = formatSignedPercent(pick.returnPct);
    const reviewLabel = pick.awaitingOutcome
      ? "Awaiting outcome price"
      : formatTimeRemaining(pick.timeRemainingMs);

    cards.push(`
      <article class="hold-monitor-card is-performance-pick">
        <div class="hold-monitor-card-top">
          <div>
            <strong>${escapeHtml(signal.productId || signal.pairSymbol || "Pick")}</strong>
            <span>${escapeHtml(signal.symbol || "24h performance pick")}</span>
          </div>
          <span class="hold-monitor-pill is-performance">24h pick</span>
        </div>
        <p>Entry ${entryPrice}; current ${currentPrice}. This coin is locked as the 24-hour performance pick until review.</p>
        <div class="hold-monitor-metrics">
          <span><small>Return</small>${returnPct}</span>
          <span><small>Review</small>${escapeHtml(reviewLabel)}</span>
        </div>
      </article>
    `);
  } else {
    const spotlight = trackingView.spotlightSignal;
    cards.push(`
      <article class="hold-monitor-card is-waiting-buy">
        <div class="hold-monitor-card-top">
          <div>
            <strong>Waiting</strong>
            <span>No active BUY</span>
          </div>
          <span class="hold-monitor-pill is-next">Gate closed</span>
        </div>
        <p>The board will not start a 24-hour trade track until a BUY clears. Until then it spotlights the strongest watch coin.</p>
        <div class="hold-monitor-metrics">
          <span><small>Status</small>Scanning</span>
          <span><small>Window</small>24h</span>
        </div>
      </article>
    `);

    if (spotlight) {
      cards.push(`
        <article class="hold-monitor-card is-spotlight">
          <div class="hold-monitor-card-top">
            <div>
              <strong>${escapeHtml(spotlight.productId || spotlight.pairSymbol || "Spotlight")}</strong>
              <span>${escapeHtml(spotlight.symbol || resolveSpotlightLabel(spotlight))}</span>
            </div>
            <span class="hold-monitor-pill is-spotlight">Spotlight</span>
          </div>
          <p>${escapeHtml(summarizeSpotlight(spotlight))}</p>
          <div class="hold-monitor-metrics">
            <span><small>Score</small>${formatScore(getSpotlightScore(spotlight))}</span>
            <span><small>Signal</small>${escapeHtml(getSignalName(spotlight))}</span>
          </div>
        </article>
      `);
    }
  }

  for (const [index, signal] of trackingView.nextBuySignals.slice(0, 3).entries()) {
    const productId = signal.productId || signal.pairSymbol || "Unknown";
    const confidence = formatPercent(signal.confidence);
    const price = formatPrice(signal.close);
    const summary = summarizeSignal(signal);

    cards.push(`
      <article class="hold-monitor-card is-next-buy">
        <div class="hold-monitor-card-top">
          <div>
            <strong>${escapeHtml(productId)}</strong>
            <span>${escapeHtml(signal.symbol || `Candidate ${index + 1}`)}</span>
          </div>
          <span class="hold-monitor-pill is-next">Next buy</span>
        </div>
        <p>${escapeHtml(summary)}</p>
        <div class="hold-monitor-metrics">
          <span><small>Confidence</small>${confidence}</span>
          <span><small>Last price</small>${price}</span>
        </div>
      </article>
    `);
  }

  for (const [index, signal] of trackingView.nextWatchSignals.slice(0, 2).entries()) {
    const productId = signal.productId || signal.pairSymbol || "Unknown";
    const confidence = formatPercent(signal.confidence);
    const price = formatPrice(signal.close);
    const summary = summarizeSpotlight(signal);

    cards.push(`
      <article class="hold-monitor-card is-watch">
        <div class="hold-monitor-card-top">
          <div>
            <strong>${escapeHtml(productId)}</strong>
            <span>${escapeHtml(signal.symbol || `Watch ${index + 1}`)}</span>
          </div>
          <span class="hold-monitor-pill is-watch">Other coin</span>
        </div>
        <p>${escapeHtml(summary)}</p>
        <div class="hold-monitor-metrics">
          <span><small>Confidence</small>${confidence}</span>
          <span><small>Last price</small>${price}</span>
        </div>
      </article>
    `);
  }

  for (const entry of trackingView.history.slice(0, 3)) {
    const outcomeLabel = entry.outcome === "underperformed" ? "Underperformed" : "Performed";
    const returnPct = formatSignedPercent(entry.returnPct);
    const exitPrice = formatPrice(entry.exitPrice);

    cards.push(`
      <article class="hold-monitor-card is-history">
        <div class="hold-monitor-card-top">
          <div>
            <strong>${escapeHtml(entry.productId || entry.pairSymbol || "History")}</strong>
            <span>${escapeHtml(formatDate(entry.closedAt))}</span>
          </div>
          <span class="hold-monitor-pill is-history">History</span>
        </div>
        <p>${escapeHtml(outcomeLabel)} after the 24-hour review at ${exitPrice}.</p>
        <div class="hold-monitor-metrics">
          <span><small>Outcome</small>${escapeHtml(outcomeLabel)}</span>
          <span><small>Return</small>${returnPct}</span>
        </div>
      </article>
    `);
  }

  for (const entry of trackingView.pickHistory.slice(0, 2)) {
    const outcomeLabel = entry.outcome === "underperformed" ? "Underperformed" : "Performed";
    const returnPct = formatSignedPercent(entry.returnPct);
    const exitPrice = formatPrice(entry.exitPrice);

    cards.push(`
      <article class="hold-monitor-card is-history">
        <div class="hold-monitor-card-top">
          <div>
            <strong>${escapeHtml(entry.productId || entry.pairSymbol || "Pick")}</strong>
            <span>${escapeHtml(formatDate(entry.closedAt))}</span>
          </div>
          <span class="hold-monitor-pill is-history">Pick result</span>
        </div>
        <p>${escapeHtml(outcomeLabel)} after the 24-hour performance review at ${exitPrice}.</p>
        <div class="hold-monitor-metrics">
          <span><small>Outcome</small>${escapeHtml(outcomeLabel)}</span>
          <span><small>Return</small>${returnPct}</span>
        </div>
      </article>
    `);
  }

  if (!cards.length) {
    holdMonitorGrid.innerHTML = '<article class="hold-monitor-empty">Waiting for BUY signals from the backend.</article>';
    return;
  }

  holdMonitorGrid.innerHTML = cards.join("");
}

async function loadBuySignalsFromApi() {
  if (!(holdMonitorGrid instanceof HTMLElement)) {
    return;
  }

  try {
    const response = await fetch(buildBackendUrl("/api/current-signals?action=all&limit=24"), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const signals = Array.isArray(payload?.signals) ? payload.signals : [];
    if (signals.length > 0 && !state.snapshot) {
      renderSnapshot({
        generatedAt: payload.generatedAt,
        primarySignal: signals[0],
        signals,
      });
    }
  } catch {
    // The websocket/live snapshot render remains the fallback.
  }
}

function renderSnapshot(snapshot) {
  state.snapshot = snapshot;
  const trackingView = updateBuyTracking(snapshot);
  const activeSignal = trackingView.activeSignal;
  const spotlightSignal = trackingView.performancePickSignal || trackingView.spotlightSignal;
  renderBuyTrackerPanel(trackingView);

  if (!activeSignal) {
    if (trackingView.performancePickSignal) {
      const pickSignal = trackingView.performancePickSignal;
      const pick = pickSignal.pick || {};
      const reviewText = pick.awaitingOutcome
        ? "Review due"
        : formatTimeRemaining(pick.timeRemainingMs);
      setConnectionState("live", `Performance pick - ${reviewText}`);
      if (liveSymbol) {
        liveSymbol.textContent = pickSignal.pairSymbol || pickSignal.productId || "24h pick";
      }
      setPrimaryAction("performance-pick", "24h pick");
      if (livePrice) {
        livePrice.textContent = formatPrice(pickSignal.close);
      }
      if (liveConfidence) {
        const returnText = formatSignedPercent(pick.returnPct);
        liveConfidence.textContent =
          `${formatScore(pick.score)} score - ${returnText} from entry`;
      }
      if (liveSummary) {
        liveSummary.textContent =
          `24-hour pick: track this coin for 24 hours from ${formatPrice(pick.entryPrice)}. ${summarizeSpotlight(pickSignal)}`;
      }
      renderTradingViewWidget(pickSignal);
      return;
    }

    if (spotlightSignal) {
      setConnectionState("live", `Watch pick updated ${formatDate(snapshot?.generatedAt)}`);
      if (liveSymbol) {
        liveSymbol.textContent = spotlightSignal.pairSymbol || spotlightSignal.productId || "24h pick";
      }
      setPrimaryAction("watch", "watch pick");
      if (livePrice) {
        livePrice.textContent = formatPrice(spotlightSignal.close);
      }
      if (liveConfidence) {
        liveConfidence.textContent =
          `${formatScore(getSpotlightScore(spotlightSignal))} spotlight - ${formatPercent(spotlightSignal.confidence)} confidence`;
      }
      if (liveSummary) {
        liveSummary.textContent =
          `Watch-only pick. ${summarizeSpotlight(spotlightSignal)}`;
      }
      renderTradingViewWidget(spotlightSignal);
      return;
    }

    setConnectionState(snapshot?.generatedAt ? "pending" : "offline", "Waiting for next BUY signal");
    if (liveSymbol) {
      liveSymbol.textContent = "Waiting for BUY";
    }
    setPrimaryAction("pending", "BUY only");
    if (livePrice) {
      livePrice.textContent = "--";
    }
    if (liveConfidence) {
      liveConfidence.textContent = "Only BUY signals are shown here";
    }
    if (liveSummary) {
      liveSummary.textContent =
        "No BUY cleared the live gate yet. LOSS, HOLD, and take-profit calls stay out of this widget while the board waits.";
    }
    if (liveChart) {
      state.activeTradingViewSymbol = null;
      liveChart.innerHTML = '<div class="hero-live-chart-placeholder">Waiting for next BUY setup</div>';
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
    const returnSuffix =
      activeSignal.tracking?.returnPct !== null && activeSignal.tracking?.returnPct !== undefined
        ? ` - ${formatSignedPercent(activeSignal.tracking.returnPct)} 24h track`
        : "";
    liveConfidence.textContent = `${formatPercent(activeSignal.confidence)} confidence${returnSuffix}`;
  }

  if (liveSummary) {
    const tracking = activeSignal.tracking || {};
    const reviewText = tracking.awaitingOutcome
      ? "The 24-hour window is complete and the board is waiting for a fresh outcome price."
      : `Review ${formatTimeRemaining(tracking.timeRemainingMs)}.`;
    liveSummary.textContent = `${reviewText} ${activeSignal.brainSummary || activeSignal.reasonSummary || "Live snapshot is connected through the backend gateway."}`;
  }

  setConnectionState("live", `Tracking BUY until ${formatDate(activeSignal.tracking?.dueAt)}`);
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
void loadBuySignalsFromApi();

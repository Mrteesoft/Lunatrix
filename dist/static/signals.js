import { buildBackendUrl, buildBackendWebSocketUrl } from "./api-base.js";
import { clearAuthSession, getAuthHeaders, getAuthToken, requireAuthSession } from "./auth.js";

const activeSession = requireAuthSession();
const connectionDot = document.querySelector("#signalsConnectionDot");
const connectionText = document.querySelector("#signalsConnectionText");
const heroSummary = document.querySelector("#signalsHeroSummary");
const primaryPair = document.querySelector("#signalsPrimaryPair");
const primaryAction = document.querySelector("#signalsPrimaryAction");
const primaryConfidence = document.querySelector("#signalsPrimaryConfidence");
const primarySummary = document.querySelector("#signalsPrimarySummary");
const primaryChart = document.querySelector("#signalsPrimaryChart");
const totalCount = document.querySelector("#signalsTotal");
const buyCount = document.querySelector("#signalsBuyCount");
const actionableCount = document.querySelector("#signalsActionableCount");
const updatedAt = document.querySelector("#signalsUpdatedAt");
const boardHint = document.querySelector("#signalsBoardHint");
const boardGrid = document.querySelector("#signalsBoardGrid");
const refreshButton = document.querySelector("#signalsRefresh");
const signOutButton = document.querySelector("#signalsSignOut");
const accountName = document.querySelector("#signalsAccountName");
const preloader = document.querySelector("#signalsPreloader");
const preloaderPercent = document.querySelector("#signalsPreloaderPercent");
const header = document.querySelector(".mistral-header");
const menuToggle = document.querySelector(".mistral-menu-toggle");

const reconnectDelayMs = 4000;
const tradingViewScriptUrl = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
const featuredSignalStorageKey = "lunatrix.featuredSignal.v1";
const featuredSignalWindowMs = 24 * 60 * 60 * 1000;
const placeholderProductIds = new Set(["ASSET-USD", "SIGNAL-USD"]);
const tradingViewSymbolOverrides = new Map([
  ["BTC-USD", "COINBASE:BTCUSD"],
  ["ETH-USD", "COINBASE:ETHUSD"],
  ["SOL-USD", "COINBASE:SOLUSD"],
  ["LINK-USD", "COINBASE:LINKUSD"],
  ["AVAX-USD", "COINBASE:AVAXUSD"],
  ["ARB-USD", "COINBASE:ARBUSD"],
]);
const initializedAt = Date.now();
let preloaderProgress = 0;
let preloaderTimer = null;
let activeSocket = null;
let reconnectTimer = null;
let activeTradingViewSymbol = null;

if (accountName && activeSession?.user?.name) {
  accountName.textContent = activeSession.user.name;
}

function setMobileMenuOpen(isOpen) {
  if (!(header instanceof HTMLElement) || !(menuToggle instanceof HTMLButtonElement)) {
    return;
  }

  header.classList.toggle("is-menu-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
}

function syncHeaderScrollState() {
  document.body.classList.toggle("is-scrolled", window.scrollY > 24);
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

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
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
    return "--";
  }

  const parsedDate = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsedDate.getTime())) {
    return String(value);
  }

  return parsedDate.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getAction(signal) {
  return String(signal?.spotAction || signal?.signalName || signal?.signal_name || "wait").toLowerCase();
}

function isLossSignal(signal) {
  const action = getAction(signal).replaceAll("-", "_");
  const signalName = String(signal?.signalName || signal?.signal_name || "").trim().toLowerCase();
  return action === "loss" || action === "cut_loss" || signalName === "loss" || signalName === "cut_loss";
}

function getActionClass(action) {
  const normalizedAction = String(action || "wait").toLowerCase();
  if (normalizedAction === "take_profit") {
    return "take-profit";
  }
  if (normalizedAction === "loss") {
    return "cut-loss";
  }
  return normalizedAction;
}

function getProductId(signal) {
  return signal?.productId || signal?.pairSymbol || "Unknown pair";
}

function hasUsableTradingViewProduct(signal) {
  const productId = getProductId(signal).toUpperCase().trim();
  return Boolean(productId) && !placeholderProductIds.has(productId) && /^([A-Z0-9]+)-([A-Z0-9]+)$/u.test(productId);
}

function buildTradingViewSymbol(signal) {
  const productId = getProductId(signal).toUpperCase().trim();
  const overrideSymbol = tradingViewSymbolOverrides.get(productId);
  if (overrideSymbol) {
    return overrideSymbol;
  }

  const productMatch = productId.match(/^([A-Z0-9]+)-([A-Z0-9]+)$/u);
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

function getSignalScore(signal) {
  const action = getAction(signal).replaceAll("-", "_");
  const actionRank =
    action === "buy" ? 400 :
    action === "take_profit" ? 180 :
    action === "wait" || action === "hold" ? 60 :
    0;
  const setupScore = Number(signal?.setupScore);
  const confidence = Number(signal?.confidence);
  const normalizedSetupScore = Number.isFinite(setupScore) ? setupScore * 100 : 0;
  const normalizedConfidence = Number.isFinite(confidence) ? confidence * 100 : 0;
  return actionRank + normalizedSetupScore + normalizedConfidence;
}

function loadFeaturedSignalState() {
  try {
    const rawValue = window.localStorage?.getItem(featuredSignalStorageKey);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

function saveFeaturedSignalState(signal) {
  try {
    const now = Date.now();
    window.localStorage?.setItem(
      featuredSignalStorageKey,
      JSON.stringify({
        productId: getProductId(signal),
        lockedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + featuredSignalWindowMs).toISOString(),
      }),
    );
  } catch {
    // Local storage can be unavailable in private or embedded browsing contexts.
  }
}

function resolveFeaturedSignal(signals, fallbackSignal = null) {
  const eligibleSignals = signals.filter((signal) => !isLossSignal(signal));
  if (!eligibleSignals.length) {
    return fallbackSignal && !isLossSignal(fallbackSignal) ? fallbackSignal : null;
  }

  const storedState = loadFeaturedSignalState();
  const storedProductId = String(storedState?.productId || "").trim().toUpperCase();
  const expiresAtMs = Date.parse(String(storedState?.expiresAt || ""));
  if (storedProductId && Number.isFinite(expiresAtMs) && Date.now() < expiresAtMs) {
    const storedSignal = eligibleSignals.find((signal) => getProductId(signal).toUpperCase() === storedProductId);
    if (storedSignal) {
      return storedSignal;
    }
  }

  const bestSignal = [...eligibleSignals].sort((leftSignal, rightSignal) => {
    const scoreDelta = getSignalScore(rightSignal) - getSignalScore(leftSignal);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return getProductId(leftSignal).localeCompare(getProductId(rightSignal));
  })[0];
  saveFeaturedSignalState(bestSignal);
  return bestSignal;
}

function sortSignalsForBoard(signals) {
  return [...signals].sort((leftSignal, rightSignal) => {
    const lossDelta = Number(isLossSignal(leftSignal)) - Number(isLossSignal(rightSignal));
    if (lossDelta !== 0) {
      return lossDelta;
    }

    const scoreDelta = getSignalScore(rightSignal) - getSignalScore(leftSignal);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return getProductId(leftSignal).localeCompare(getProductId(rightSignal));
  });
}

function getSignalSummary(signal) {
  return (
    signal?.brainSummary ||
    signal?.reasonSummary ||
    signal?.explanationSummary ||
    signal?.signalChat ||
    "No signal explanation was published for this market yet."
  );
}

function setConnectionState(stateName, label) {
  if (connectionDot) {
    connectionDot.className = "live-connection-dot";
    connectionDot.classList.add(`is-${stateName}`);
  }

  if (connectionText) {
    connectionText.textContent = label;
  }
}

function setPreloaderProgress(value) {
  preloaderProgress = Math.max(preloaderProgress, Math.min(Math.round(value), 100));
  if (preloaderPercent) {
    preloaderPercent.textContent = `${preloaderProgress}%`;
  }
  document.documentElement.style.setProperty("--signals-preloader-progress", `${preloaderProgress}%`);
}

function startPreloaderProgress() {
  setPreloaderProgress(8);
  preloaderTimer = window.setInterval(() => {
    const nextProgress = preloaderProgress < 72 ? preloaderProgress + 7 : preloaderProgress + 2;
    setPreloaderProgress(Math.min(nextProgress, 92));
  }, 120);
}

function finishInitialization() {
  setPreloaderProgress(100);
  if (preloaderTimer !== null) {
    window.clearInterval(preloaderTimer);
    preloaderTimer = null;
  }

  const elapsedMs = Date.now() - initializedAt;
  const remainingMs = Math.max(700 - elapsedMs, 0);

  window.setTimeout(() => {
    document.body.classList.remove("is-initializing");
    preloader?.setAttribute("aria-hidden", "true");
  }, remainingMs);
}

function renderPrimarySignal(signal, generatedAt) {
  if (!signal) {
    primaryPair.textContent = "--";
    primaryAction.className = "live-signal-action is-pending";
    primaryAction.textContent = "waiting";
    primaryConfidence.textContent = "No primary signal";
    primarySummary.textContent = "Publish a current signal snapshot to populate the signal board.";
    renderPrimaryChart(null);
    return;
  }

  const action = getAction(signal);
  primaryPair.textContent = getProductId(signal);
  primaryAction.className = "live-signal-action";
  primaryAction.classList.add(`is-${getActionClass(action)}`);
  primaryAction.textContent = sentenceCase(action);
  primaryConfidence.textContent = `${formatPercent(signal.confidence)} confidence - ${formatPrice(signal.close ?? signal.price)}`;
  primarySummary.textContent = getSignalSummary(signal);
  setConnectionState("live", `Updated ${formatDate(generatedAt || signal.generatedAt || signal.timestamp)}`);
  renderPrimaryChart(signal);
}

function renderPrimaryChart(signal) {
  if (!(primaryChart instanceof HTMLElement)) {
    return;
  }

  if (!signal || !hasUsableTradingViewProduct(signal)) {
    activeTradingViewSymbol = null;
    primaryChart.innerHTML = '<div class="signals-chart-placeholder">Chart unavailable for this market</div>';
    return;
  }

  const tradingViewSymbol = buildTradingViewSymbol(signal);
  if (activeTradingViewSymbol === tradingViewSymbol && primaryChart.querySelector("iframe")) {
    return;
  }

  activeTradingViewSymbol = tradingViewSymbol;
  primaryChart.innerHTML = `
    <div class="tradingview-widget-container signals-tradingview-widget">
      <div class="tradingview-widget-container__widget"></div>
    </div>
  `;

  const widgetHost = primaryChart.querySelector(".signals-tradingview-widget");
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
    theme: "dark",
    style: "1",
    locale: "en",
    allow_symbol_change: false,
    hide_top_toolbar: true,
    hide_side_toolbar: true,
    withdateranges: false,
    save_image: false,
    calendar: false,
    studies: ["Volume@tv-basicstudies"],
    support_host: "https://www.tradingview.com",
  });
  widgetHost.append(widgetScript);
}

function renderMetrics(signals, payload) {
  const counts = signals.reduce(
    (accumulator, signal) => {
      const action = getAction(signal);
      accumulator.total += 1;
      if (action === "buy") {
        accumulator.buy += 1;
      }
      if (action !== "wait" || signal.actionable) {
        accumulator.actionable += 1;
      }
      return accumulator;
    },
    { actionable: 0, buy: 0, total: 0 },
  );

  totalCount.textContent = String(payload?.count ?? counts.total);
  buyCount.textContent = String(counts.buy);
  actionableCount.textContent = String(counts.actionable);
  updatedAt.textContent = formatDate(payload?.generatedAt);
}

function renderSignals(signals, payload = {}) {
  renderMetrics(signals, payload);
  const featuredSignal = resolveFeaturedSignal(signals, payload.primarySignal || signals[0] || null);
  renderPrimarySignal(featuredSignal, payload.generatedAt);

  if (!signals.length) {
    boardGrid.innerHTML = '<article class="signals-card signals-card-empty">No model-generated signals are published yet.</article>';
    boardHint.textContent = "No published model signals are available right now.";
    heroSummary.textContent = "The signal page is connected, but the model has not published a signal feed yet.";
    return;
  }

  const sortedSignals = sortSignalsForBoard(signals);
  boardHint.textContent = `Showing ${signals.length} model-generated signal${signals.length === 1 ? "" : "s"}; loss-cut entries are kept below active setups.`;
  heroSummary.textContent = featuredSignal
    ? `${getProductId(featuredSignal)} is the current featured setup.`
    : "No eligible non-loss setup is available right now.";
  boardGrid.innerHTML = sortedSignals
    .map((signal) => {
      const action = getAction(signal);
      return `
        <article class="signals-card">
          <div class="signals-card-top">
            <div>
              <strong>${escapeHtml(getProductId(signal))}</strong>
              <span>${escapeHtml(signal.coinName || signal.symbol || "Crypto asset")}</span>
            </div>
            <span class="signals-action-pill is-${escapeHtml(action)}">${escapeHtml(sentenceCase(action))}</span>
          </div>
          <p>${escapeHtml(getSignalSummary(signal))}</p>
          <div class="signals-card-metrics">
            <span><small>Confidence</small>${formatPercent(signal.confidence)}</span>
            <span><small>Setup</small>${signal.setupScore !== undefined ? Number(signal.setupScore).toFixed(2) : "-"}</span>
            <span><small>Price</small>${formatPrice(signal.close ?? signal.price)}</span>
            <span><small>Signal</small>${escapeHtml(signal.signalName || signal.signal_name || "-")}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

async function fetchJson(pathname) {
  const response = await fetch(buildBackendUrl(pathname), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...getAuthHeaders(),
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthSession();
      window.location.assign(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      throw new Error("Authentication is required.");
    }

    throw new Error(payload?.message || payload?.detail || `${response.status} ${response.statusText}`);
  }

  return payload;
}

async function loadSignals() {
  refreshButton.disabled = true;
  setConnectionState("pending", "Loading signal feed");

  try {
    const payload = await fetchJson("/api/current-signals?action=all&limit=24");
    const signals = Array.isArray(payload?.signals) ? payload.signals : [];
    renderSignals(signals, payload);
  } catch (error) {
    setConnectionState("offline", "Backend unavailable");
    boardGrid.innerHTML = `<article class="signals-card signals-card-empty">${escapeHtml(error.message)}</article>`;
    boardHint.textContent = "The signal board could not reach the backend gateway.";
    heroSummary.textContent = error.message;
  } finally {
    refreshButton.disabled = false;
    finishInitialization();
  }
}

function scheduleReconnect() {
  if (reconnectTimer !== null) {
    return;
  }

  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectLiveSignalStream();
  }, reconnectDelayMs);
}

function connectLiveSignalStream() {
  if (activeSocket !== null) {
    activeSocket.close();
    activeSocket = null;
  }

  try {
    const websocketPath = document.body?.dataset?.liveSignalWsPath || "/ws/live-signals";
    const websocketUrl = new URL(buildBackendWebSocketUrl(websocketPath));
    websocketUrl.searchParams.set("access_token", getAuthToken());
    const socket = new WebSocket(websocketUrl.toString());
    activeSocket = socket;

    socket.addEventListener("open", () => {
      setConnectionState("pending", "Live stream connected");
    });

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(String(event.data));
      if (payload?.type === "error") {
        throw new Error(payload.message || "Live stream error");
      }

      const signals = Array.isArray(payload?.signals) ? payload.signals : [];
      renderPrimarySignal(resolveFeaturedSignal(signals, payload.primarySignal || signals[0] || null), payload.generatedAt);
    });

    socket.addEventListener("error", () => {
      setConnectionState("offline", "Live stream unavailable");
    });

    socket.addEventListener("close", () => {
      if (activeSocket === socket) {
        activeSocket = null;
      }
      scheduleReconnect();
    });
  } catch {
    setConnectionState("offline", "Live stream unavailable");
  }
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

window.addEventListener("scroll", syncHeaderScrollState, { passive: true });

refreshButton.addEventListener("click", () => {
  void loadSignals();
});

if (signOutButton instanceof HTMLButtonElement) {
  signOutButton.addEventListener("click", () => {
    clearAuthSession();
    window.location.assign("/login");
  });
}

if (activeSession?.token) {
  syncHeaderScrollState();
  startPreloaderProgress();
  connectLiveSignalStream();
  void loadSignals();
}

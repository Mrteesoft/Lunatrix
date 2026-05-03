import { buildBackendUrl } from "./api-base.js";

const statusBadge = document.querySelector("#statusBadge");
const heroSummary = document.querySelector("#heroSummary");
const backendStatusText = document.querySelector("#backendStatusText");
const heroModelName = document.querySelector("#heroModelName");
const heroSnapshotTime = document.querySelector("#heroSnapshotTime");
const actionableCount = document.querySelector("#actionableCount");
const modelTypeCard = document.querySelector("#modelTypeCard");
const featureCountText = document.querySelector("#featureCountText");
const predictionHorizon = document.querySelector("#predictionHorizon");
const signalMix = document.querySelector("#signalMix");
const primarySignalTitle = document.querySelector("#primarySignalTitle");
const primarySignalPill = document.querySelector("#primarySignalPill");
const primarySignalCopy = document.querySelector("#primarySignalCopy");
const primaryConfidence = document.querySelector("#primaryConfidence");
const primaryPair = document.querySelector("#primaryPair");
const primaryAction = document.querySelector("#primaryAction");
const modelStatusTitle = document.querySelector("#modelStatusTitle");
const modelStatusText = document.querySelector("#modelStatusText");
const modelSourcePath = document.querySelector("#modelSourcePath");
const marketSource = document.querySelector("#marketSource");
const productMode = document.querySelector("#productMode");
const trainSplit = document.querySelector("#trainSplit");
const modelArtifactAge = document.querySelector("#modelArtifactAge");
const modelLifecycleStatus = document.querySelector("#modelLifecycleStatus");
const modelBalancedAccuracy = document.querySelector("#modelBalancedAccuracy");
const modelDataFreshness = document.querySelector("#modelDataFreshness");
const featureChips = document.querySelector("#featureChips");
const topFeatureList = document.querySelector("#topFeatureList");
const workflowList = document.querySelector("#workflowList");
const endpointList = document.querySelector("#endpointList");
const researchSummary = document.querySelector("#researchSummary");
const roadmapGrid = document.querySelector("#roadmapGrid");
const roadmapQuestion = document.querySelector("#roadmapQuestion");
const signalHint = document.querySelector("#signalHint");
const signalsGrid = document.querySelector("#signalsGrid");
const refreshButton = document.querySelector("#refreshButton");
const hero = document.querySelector(".hero");
const heroVideo = document.querySelector("#heroVideo");
const refreshLiveButton = document.querySelector("#refreshLiveButton");
const liveStatusText = document.querySelector("#liveStatusText");
const liveGeneratedAt = document.querySelector("#liveGeneratedAt");
const liveProductsCovered = document.querySelector("#liveProductsCovered");
const livePrimaryPair = document.querySelector("#livePrimaryPair");
const livePrimarySignal = document.querySelector("#livePrimarySignal");
const liveSignalList = document.querySelector("#liveSignalList");
const assistantStatusText = document.querySelector("#assistantStatusText");
const chatThread = document.querySelector("#chatThread");
const assistantForm = document.querySelector("#assistantForm");
const assistantInput = document.querySelector("#assistantInput");
const assistantProductInput = document.querySelector("#assistantProductInput");
const assistantSendButton = document.querySelector("#assistantSendButton");
const ragStatusText = document.querySelector("#ragStatusText");
const ragSourceCount = document.querySelector("#ragSourceCount");
const ragChunkCount = document.querySelector("#ragChunkCount");
const ragSourceList = document.querySelector("#ragSourceList");
const ragForm = document.querySelector("#ragForm");
const ragTitleInput = document.querySelector("#ragTitleInput");
const ragUrlInput = document.querySelector("#ragUrlInput");
const ragTextInput = document.querySelector("#ragTextInput");
const ragAddUrlButton = document.querySelector("#ragAddUrlButton");
const ragAddTextButton = document.querySelector("#ragAddTextButton");
const ragSearchForm = document.querySelector("#ragSearchForm");
const ragSearchInput = document.querySelector("#ragSearchInput");
const ragSearchButton = document.querySelector("#ragSearchButton");
const ragSearchResults = document.querySelector("#ragSearchResults");
const filterButtons = [...document.querySelectorAll("[data-filter]")];

const state = {
  currentFilter: "all",
  assistantSessionId: null,
};
const jobPollIntervalMs = 1500;
const jobTimeoutMs = 180000;

function setStatusBadge(status) {
  statusBadge.className = "status-badge";

  if (status === "ok") {
    statusBadge.classList.add("is-ok");
    statusBadge.textContent = "Online";
    return;
  }

  if (status === "waiting_for_snapshot") {
    statusBadge.classList.add("is-waiting");
    statusBadge.textContent = "Waiting";
    return;
  }

  statusBadge.classList.add("is-error");
  statusBadge.textContent = "Error";
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) {
    return "Pending";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatAgeHours(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  const numericValue = Number(value);
  if (numericValue < 1) {
    return `${Math.max(Math.round(numericValue * 60), 1)} min`;
  }

  if (numericValue < 24) {
    return `${numericValue.toFixed(1)} h`;
  }

  return `${(numericValue / 24).toFixed(1)} d`;
}

function sentenceCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function resolveSignalName(signal) {
  return signal?.signalName || signal?.signal_name || "";
}

function formatMarketSource(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "-";
  }

  const sourceLabels = {
    coinmarketcap: "CoinMarketCap",
    coinbaseExchange: "Coinbase Exchange",
    coinbaseExchangeRest: "Coinbase Exchange REST",
  };

  return sourceLabels[normalizedValue] || sentenceCase(normalizedValue);
}

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLanding(landing, health) {
  const snapshot = landing.snapshot || {};
  const model = landing.model || {};
  const lifecycle = model.lifecycle || {};
  const trainingMetrics = model.trainingMetrics || {};
  const marketSummary = snapshot.marketSummary || {};
  const signalCounts = marketSummary.signalCounts || {};
  const primarySignal = snapshot.primarySignal || {};
  const hasPublishedSignals = Number(marketSummary.totalSignals || 0) > 0;

  setStatusBadge(health.status);
  if (health.status === "ok" && health.modelRetrainingDue) {
    backendStatusText.textContent =
      "Gateway is live and serving bot-ready signal payloads, but the active model should be refreshed before the next release cycle.";
  } else if (health.status === "ok") {
    backendStatusText.textContent =
      "Gateway is live. Cached signals, live inference, and assistant routes are ready for the landing page and external integrations.";
  } else {
    backendStatusText.textContent =
      "Gateway is online, but it is still waiting for a freshly published signal snapshot from the model service.";
  }

  heroModelName.textContent = model.modelType || snapshot.modelType || "No trained model yet";
  heroSnapshotTime.textContent = formatDate(snapshot.generatedAt);

  heroSummary.textContent =
    snapshot.status === "ready"
      ? `Snapshot published ${formatDate(snapshot.generatedAt)} with ${marketSummary.actionableSignals || 0} actionable calls across ${marketSummary.totalSignals || 0} tracked markets. These forecasts can be shown on the site or consumed through the API by trading bots.${lifecycle.retrainingDue ? " A fresh retraining cycle is recommended before the next publish." : ""}`
      : "The product shell is live. Run the production cycle to refresh market data, retrain the model, and publish a fresh signal snapshot.";

  actionableCount.textContent = String(marketSummary.actionableSignals || 0);
  modelTypeCard.textContent = model.modelType || "No artifact yet";
  featureCountText.textContent =
    model.status === "ready"
      ? `${model.featureCount || 0} engineered features are currently driving the public signal API.${trainingMetrics.balancedAccuracy !== undefined ? ` Latest balanced accuracy: ${formatPercent(trainingMetrics.balancedAccuracy)}.` : ""}`
      : model.message || "Train a model to see feature metadata.";
  predictionHorizon.textContent =
    model.settings?.predictionHorizon !== undefined ? String(model.settings.predictionHorizon) : "-";
  signalMix.textContent = `buy ${signalCounts.buy || 0} / take ${signalCounts.take_profit || 0} / loss ${signalCounts.loss || 0} / wait ${signalCounts.wait || 0}`;

  primarySignalTitle.textContent = hasPublishedSignals
    ? primarySignal.signal_name || "Awaiting snapshot"
    : "Watchlist";
  primarySignalCopy.textContent =
    primarySignal.signalChat ||
    (hasPublishedSignals
      ? "Publish a fresh signal snapshot to surface the highest-conviction forecast here."
      : "No public trade-ready signal is published right now. Candidates remain on the internal watchlist until a BUY appears or an open trade needs management.");
  primaryConfidence.textContent = formatPercent(primarySignal.confidence);
  primaryPair.textContent = primarySignal.productId || primarySignal.pairSymbol || "-";
  primaryAction.textContent = hasPublishedSignals ? sentenceCase(primarySignal.spotAction || "-") : "Internal only";
  primarySignalPill.textContent = primarySignal.spotAction
    ? sentenceCase(primarySignal.spotAction)
    : hasPublishedSignals
      ? "Offline"
      : "Watchlist";
  primarySignalPill.className = "signal-pill";
  if (primarySignal.spotAction) {
    primarySignalPill.classList.add(`is-${primarySignal.spotAction}`);
  }

  modelStatusTitle.textContent =
    model.status === "ready" ? model.modelType : "Model artifact not loaded";
  modelStatusText.textContent =
    model.status === "ready"
      ? `Artifact published ${formatDate(lifecycle.artifactCreatedAt || model.lastModified)}.${lifecycle.recommendedAction ? ` ${lifecycle.recommendedAction}` : ""}`
      : model.message || "No trained model was found in the model-service/models folder.";
  modelSourcePath.textContent = model.path || "-";
  marketSource.textContent = formatMarketSource(model.settings?.marketDataSource);
  productMode.textContent = model.settings?.productMode || "-";
  trainSplit.textContent =
    model.settings?.trainSize !== undefined ? formatPercent(model.settings.trainSize) : "-";
  modelArtifactAge.textContent = formatAgeHours(lifecycle.ageHours);
  modelLifecycleStatus.textContent =
    model.status === "ready"
      ? lifecycle.retrainingDue
        ? "Retrain due"
        : sentenceCase(lifecycle.freshness || "unknown")
      : "-";
  modelBalancedAccuracy.textContent =
    trainingMetrics.balancedAccuracy !== undefined ? formatPercent(trainingMetrics.balancedAccuracy) : "-";
  modelDataFreshness.textContent =
    model.status === "ready"
      ? lifecycle.newerDataAvailable
        ? "Raw data newer than model"
        : lifecycle.trainingDataLastModified
          ? `Aligned as of ${formatDate(lifecycle.trainingDataLastModified)}`
          : "Training data timestamp unavailable"
      : "-";

  renderFeatureChips(model.featurePreview || []);
  renderTopFeatures(model.topFeatures || []);
  renderWorkflow(landing.workflow || []);
  renderEndpoints(landing.endpoints || []);
  renderModelResearch(landing.modelResearch || {});
}

function renderFeatureChips(features) {
  if (!features.length) {
    featureChips.innerHTML = '<span class="chip chip-muted">No feature list available yet</span>';
    return;
  }

  featureChips.innerHTML = features
    .map((feature) => `<span class="chip">${feature}</span>`)
    .join("");
}

function renderTopFeatures(features) {
  if (!features.length) {
    topFeatureList.innerHTML =
      '<p class="empty-state">Feature importance appears after a trained model is available.</p>';
    return;
  }

  const peakImportance = Math.max(...features.map((feature) => Number(feature.importance || 0)), 0.0001);
  topFeatureList.innerHTML = features
    .map((feature) => {
      const width = Math.max((Number(feature.importance || 0) / peakImportance) * 100, 4);
      return `
        <div class="feature-bar">
          <div class="feature-track">
            <span class="feature-fill" style="width: ${width}%"></span>
          </div>
          <strong>${feature.name}</strong>
        </div>
      `;
    })
    .join("");
}

function renderWorkflow(items) {
  workflowList.innerHTML = items
    .map(
      (item, index) => `
        <article class="workflow-item">
          <strong>${index + 1}. ${item.step}</strong>
          <span class="workflow-step">${item.command}</span>
        </article>
      `,
    )
    .join("");
}

function renderEndpoints(items) {
  endpointList.innerHTML = items
    .map(
      (item) => `
        <article class="endpoint-item">
          <strong>${item.label}</strong>
          <span class="endpoint-path">${item.path}</span>
        </article>
      `,
    )
    .join("");
}

function renderModelResearch(research) {
  researchSummary.textContent =
    research.summary ||
    "The roadmap highlights the highest-leverage changes for improving model quality.";

  const tracks = research.tracks || [];
  if (!tracks.length) {
    roadmapGrid.innerHTML =
      '<article class="roadmap-card"><p class="empty-state">No model research roadmap has been published yet.</p></article>';
    roadmapQuestion.textContent =
      "Current bottleneck to attack first: labeling, validation, or feature engineering?";
    return;
  }

  roadmapGrid.innerHTML = tracks
    .map(
      (track, index) => `
        <article class="roadmap-card">
          <div class="roadmap-card-header">
            <span class="roadmap-index">0${index + 1}</span>
            <span class="chip roadmap-tag">${escapeHtml(track.theme || "Research")}</span>
          </div>
          <h3>${escapeHtml(track.title || "Untitled track")}</h3>
          <p>${escapeHtml(track.problem || "")}</p>
          <p class="roadmap-proposal">${escapeHtml(track.proposal || "")}</p>
          <ul class="roadmap-detail-list">
            ${(track.details || [])
              .map((detail) => `<li>${escapeHtml(detail)}</li>`)
              .join("")}
          </ul>
          <div class="roadmap-impact">
            <span class="meta-label">Why it matters</span>
            <strong>${escapeHtml(track.impact || "-")}</strong>
          </div>
        </article>
      `,
    )
    .join("");

  roadmapQuestion.textContent =
    research.focusQuestion ||
    "Current bottleneck to attack first: labeling, validation, or feature engineering?";
}

function renderLiveOverview(snapshot) {
  const primarySignal = snapshot?.primarySignal || {};
  const liveSignals = snapshot?.signals || [];

  liveStatusText.textContent =
    snapshot?.generatedAt
      ? `Live inference refreshed ${formatDate(snapshot.generatedAt)} from ${formatMarketSource(snapshot.marketDataSource)} candles. The gateway can reuse this result for about ${snapshot.liveSignalCacheSeconds || 0} seconds before the next market pull.`
      : "Live inference has not produced a market read yet.";
  liveGeneratedAt.textContent = formatDate(snapshot?.generatedAt);
  liveProductsCovered.textContent = snapshot?.productsCovered !== undefined ? String(snapshot.productsCovered) : "-";
  livePrimaryPair.textContent = primarySignal.productId || "-";
  livePrimarySignal.textContent =
    resolveSignalName(primarySignal) && primarySignal.confidence !== undefined
      ? `${resolveSignalName(primarySignal)} (${formatPercent(primarySignal.confidence)})`
      : "-";

  if (!liveSignals.length) {
    liveSignalList.innerHTML = '<p class="empty-state">No live signals were returned yet.</p>';
    return;
  }

  liveSignalList.innerHTML = liveSignals
    .slice(0, 5)
    .map(
      (signal) => `
        <article class="live-signal-item">
          <div>
            <strong>${escapeHtml(signal.productId || signal.pairSymbol || "Unknown pair")}</strong>
            <span class="meta-label">${escapeHtml(resolveSignalName(signal) || "Signal")} • ${formatPercent(signal.confidence)}</span>
          </div>
          <div class="live-signal-price">${formatPrice(signal.close)}</div>
        </article>
      `,
    )
    .join("");
}

function renderAssistantMessages(messages) {
  if (!messages.length) {
    chatThread.innerHTML = `
      <article class="chat-bubble assistant">
        <p>No assistant messages yet.</p>
      </article>
    `;
    return;
  }

  chatThread.innerHTML = messages
    .map(
      (message) => `
        <article class="chat-bubble ${message.role}">
          <span class="meta-label">${sentenceCase(message.role)}</span>
          <p>${escapeHtml(message.content || "").replaceAll("\n", "<br />")}</p>
        </article>
      `,
    )
    .join("");

  chatThread.scrollTop = chatThread.scrollHeight;
}

function renderRagStatus(status, sources = []) {
  ragStatusText.textContent =
    status?.enabled
      ? `Knowledge store is active with ${status.sourceCount || 0} sources and ${status.chunkCount || 0} chunks. Assistant replies can combine live signal context with external research from this store.`
      : "Knowledge store is disabled in the current backend config.";
  ragSourceCount.textContent = status?.sourceCount !== undefined ? String(status.sourceCount) : "-";
  ragChunkCount.textContent = status?.chunkCount !== undefined ? String(status.chunkCount) : "-";

  if (!sources.length) {
    ragSourceList.innerHTML = '<p class="empty-state">No RAG sources loaded yet.</p>';
    return;
  }

  ragSourceList.innerHTML = sources
    .map(
      (source) => `
        <article class="knowledge-source-item">
          <div>
            <strong>${escapeHtml(source.title || "Untitled source")}</strong>
            <span class="meta-label">${escapeHtml(source.sourceType || "source")} • ${source.chunkCount || 0} chunks</span>
            <p>${escapeHtml(source.sourceUri || "No source URI")}</p>
          </div>
          <button class="filter-chip knowledge-delete-button" data-source-id="${escapeHtml(source.sourceId || "")}" type="button">
            Remove
          </button>
        </article>
      `,
    )
    .join("");
}

function renderRagSearchResults(results) {
  if (!results.length) {
    ragSearchResults.innerHTML = '<p class="empty-state">No matching knowledge chunks were found.</p>';
    return;
  }

  ragSearchResults.innerHTML = results
    .map(
      (result) => `
        <article class="knowledge-search-item">
          <strong>${escapeHtml(result.title || "External source")}</strong>
          <span class="meta-label">${escapeHtml(result.sourceUri || result.sourceType || "knowledge source")}</span>
          <p>${escapeHtml(result.snippet || result.content || "")}</p>
        </article>
      `,
    )
    .join("");
}

function renderSignals(signals, filterName) {
  if (!signals.length) {
    signalsGrid.innerHTML =
      '<article class="signal-card signal-card-empty"><p>No signals match the current filter yet.</p></article>';
    signalHint.textContent = `No published forecasts are available for the "${sentenceCase(filterName)}" filter.`;
    return;
  }

  signalsGrid.innerHTML = signals
    .map((signal) => {
      const action = signal.spotAction || "wait";
      return `
        <article class="signal-card">
          <div class="signal-card-top">
            <div>
              <h3>${signal.productId || signal.pairSymbol || "Unknown pair"}</h3>
              <span class="meta-label">${signal.coinName || signal.symbol || "Crypto asset"}</span>
            </div>
            <span class="signal-badge ${action}">${sentenceCase(action)}</span>
          </div>
          <p>${signal.signalChat || "No signal explanation available."}</p>
          <div class="signal-card-meta">
            <div>
              <span class="meta-label">Confidence</span>
              <strong>${formatPercent(signal.confidence)}</strong>
            </div>
            <div>
              <span class="meta-label">Setup score</span>
              <strong>${signal.setupScore !== undefined ? Number(signal.setupScore).toFixed(2) : "-"}</strong>
            </div>
            <div>
              <span class="meta-label">Signal name</span>
              <strong>${signal.signal_name || "-"}</strong>
            </div>
            <div>
              <span class="meta-label">Price</span>
              <strong>${
                signal.close !== undefined
                  ? Number(signal.close).toFixed(2)
                  : signal.price !== undefined
                    ? Number(signal.price).toFixed(2)
                    : "-"
              }</strong>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  signalHint.textContent = `Showing ${signals.length} published signal card${signals.length === 1 ? "" : "s"} for the "${sentenceCase(filterName)}" filter.`;
}

function renderSignalError(message) {
  signalsGrid.innerHTML = `
    <article class="signal-card signal-card-empty">
      <p>${message}</p>
    </article>
  `;
  signalHint.textContent = "Publish a snapshot from the model service to enable the signal board.";
}

function setupHeroVideo() {
  if (!hero || !heroVideo) {
    return;
  }

  const markVideoReady = () => {
    hero.classList.add("has-video");
    hero.classList.remove("is-video-fallback");
  };

  const markVideoFallback = () => {
    if (!hero.classList.contains("has-video")) {
      hero.classList.add("is-video-fallback");
    }
  };

  heroVideo.addEventListener("canplay", markVideoReady, { once: true });
  heroVideo.addEventListener("playing", markVideoReady, { once: true });
  heroVideo.addEventListener("error", markVideoFallback, { once: true });

  if (heroVideo.readyState >= 2) {
    markVideoReady();
    return;
  }

  const playAttempt = heroVideo.play();
  if (playAttempt && typeof playAttempt.catch === "function") {
    playAttempt.catch(() => {
      markVideoFallback();
    });
  }
}

async function fetchJson(url) {
  const resolvedUrl = buildBackendUrl(url);
  const response = await fetch(resolvedUrl);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.detail || `Request failed for ${resolvedUrl}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function postJson(url, body) {
  const resolvedUrl = buildBackendUrl(url);
  const response = await fetch(resolvedUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.detail || `Request failed for ${resolvedUrl}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForJob(jobId) {
  const startedAt = Date.now();

  while ((Date.now() - startedAt) < jobTimeoutMs) {
    const job = await fetchJson(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (job.status === "completed") {
      return fetchJson(`/api/jobs/${encodeURIComponent(jobId)}/result`);
    }

    if (["failed", "cancelled", "timed_out"].includes(job.status)) {
      throw new Error(job.errorReason || `Job ${jobId} ended with status ${job.status}.`);
    }

    await sleep(jobPollIntervalMs);
  }

  throw new Error(`Job ${jobId} timed out after ${Math.round(jobTimeoutMs / 1000)} seconds.`);
}

async function enqueueJob(url, body) {
  const submission = await postJson(url, body);
  return waitForJob(submission.jobId);
}

async function loadLiveOverview(forceRefresh = false) {
  try {
    let snapshot;
    if (forceRefresh) {
      liveStatusText.textContent = "Queued a live market scan. Waiting for the worker to publish an updated snapshot.";
      const jobResult = await enqueueJob("/api/jobs/scan-market", {
        persistLiveSnapshot: true,
      });
      snapshot = await fetchJson("/api/live/snapshot?force_refresh=false").catch(() => jobResult.liveSnapshot);
    } else {
      snapshot = await fetchJson("/api/live/snapshot?force_refresh=false");
    }

    renderLiveOverview(snapshot);
    return snapshot;
  } catch (error) {
    liveStatusText.textContent = error.message;
    liveGeneratedAt.textContent = "-";
    liveProductsCovered.textContent = "-";
    livePrimaryPair.textContent = "-";
    livePrimarySignal.textContent = "-";
    liveSignalList.innerHTML = '<p class="empty-state">Live market data is unavailable.</p>';
    return null;
  }
}

async function ensureAssistantSession() {
  if (state.assistantSessionId) {
    return state.assistantSessionId;
  }

  const sessionPayload = await postJson("/api/chat/sessions", {});
  state.assistantSessionId = sessionPayload.session?.sessionId || null;
  assistantStatusText.textContent =
    state.assistantSessionId
      ? "Assistant session is live. Ask about a pair, the latest market pulse, or what the model sees right now."
      : "Assistant session could not be started.";
  renderAssistantMessages(sessionPayload.messages || []);
  return state.assistantSessionId;
}

async function sendAssistantMessage() {
  const message = assistantInput.value.trim();
  const productId = assistantProductInput.value.trim();

  if (!message) {
    assistantStatusText.textContent = "Enter a question before sending it to the assistant.";
    return;
  }

  assistantSendButton.disabled = true;

  try {
    const sessionId = await ensureAssistantSession();
    if (!sessionId) {
      assistantStatusText.textContent = "Assistant session is unavailable.";
      return;
    }

    assistantStatusText.textContent = "Assistant is reading live market data and composing an operator-grade reply.";
    const responsePayload = await enqueueJob("/api/jobs/chat-analysis", {
      sessionId,
      message,
      productId: productId || null,
      forceRefresh: true,
    });
    const response = responsePayload.chatResponse || {};

    renderAssistantMessages(response.messages || []);
    assistantStatusText.textContent =
      response.liveContext?.source === "live"
        ? "Assistant reply was updated from live market data."
        : "Assistant reply used cached context because the live pull was unavailable.";
    assistantInput.value = "";
    await loadLiveOverview(true);
  } catch (error) {
    assistantStatusText.textContent = error.message;
  } finally {
    assistantSendButton.disabled = false;
  }
}

async function loadKnowledgeBase() {
  try {
    const [status, sourcePayload] = await Promise.all([
      fetchJson("/api/rag/status"),
      fetchJson("/api/rag/sources?limit=20"),
    ]);
    renderRagStatus(status, sourcePayload.sources || []);
  } catch (error) {
    ragStatusText.textContent = error.message;
    ragSourceCount.textContent = "-";
    ragChunkCount.textContent = "-";
    ragSourceList.innerHTML = '<p class="empty-state">Knowledge sources are unavailable.</p>';
  }
}

async function ingestRagSource(kind) {
  const title = ragTitleInput.value.trim();
  const url = ragUrlInput.value.trim();
  const content = ragTextInput.value.trim();

  if (kind === "url" && !url) {
    ragStatusText.textContent = "Enter a URL before adding it to the knowledge store.";
    return;
  }

  if (kind === "text" && (!title || !content)) {
    ragStatusText.textContent = "Text ingestion requires both a title and raw text.";
    return;
  }

  ragAddUrlButton.disabled = true;
  ragAddTextButton.disabled = true;
  ragStatusText.textContent =
    kind === "url"
      ? "Fetching and chunking the external URL."
      : "Chunking the pasted text into the knowledge store.";

  try {
    const endpoint = kind === "url" ? "/api/rag/documents/url" : "/api/rag/documents/text";
    const payload =
      kind === "url"
        ? { url, title: title || null }
        : { title, content, sourceUri: url || null };

    await postJson(endpoint, payload);
    ragTitleInput.value = "";
    if (kind === "url") {
      ragUrlInput.value = "";
    } else {
      ragTextInput.value = "";
    }
    ragStatusText.textContent = "Knowledge source ingested successfully.";
    await loadKnowledgeBase();
  } catch (error) {
    ragStatusText.textContent = error.message;
  } finally {
    ragAddUrlButton.disabled = false;
    ragAddTextButton.disabled = false;
  }
}

async function searchKnowledgeBase() {
  const query = ragSearchInput.value.trim();
  if (!query) {
    ragStatusText.textContent = "Enter a query before searching the knowledge store.";
    return;
  }

  ragSearchButton.disabled = true;

  try {
    const resultPayload = await postJson("/api/rag/search", {
      query,
      limit: 6,
    });
    renderRagSearchResults(resultPayload.results || []);
    ragStatusText.textContent = `Knowledge search returned ${resultPayload.count || 0} matching chunks.`;
  } catch (error) {
    ragStatusText.textContent = error.message;
    renderRagSearchResults([]);
  } finally {
    ragSearchButton.disabled = false;
  }
}

async function deleteKnowledgeSource(sourceId) {
  if (!sourceId) {
    return;
  }

  try {
    const response = await fetch(buildBackendUrl(`/api/rag/sources/${encodeURIComponent(sourceId)}`), {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.detail || "Failed to delete knowledge source.");
    }

    ragStatusText.textContent = `Removed knowledge source ${sourceId}.`;
    await loadKnowledgeBase();
  } catch (error) {
    ragStatusText.textContent = error.message;
  }
}

async function loadSignals(filterName = state.currentFilter) {
  state.currentFilter = filterName;
  filterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === filterName);
  });

  try {
    const signalPayload = await fetchJson(`/api/current-signals?action=${encodeURIComponent(filterName)}&limit=12`);
    renderSignals(signalPayload.signals || [], signalPayload.action || filterName);
  } catch (error) {
    renderSignalError(error.message);
  }
}

async function initialize() {
  try {
    const [landing, health] = await Promise.all([fetchJson("/api/landing"), fetchJson("/api/health")]);
    renderLanding(landing, health);
    await Promise.all([
      loadSignals(state.currentFilter),
      loadLiveOverview(false),
      ensureAssistantSession(),
      loadKnowledgeBase(),
    ]);
  } catch (error) {
    setStatusBadge("error");
    backendStatusText.textContent = "The landing page could not reach the backend.";
    heroSummary.textContent = error.message;
    renderSignalError(error.message);
    liveStatusText.textContent = error.message;
    assistantStatusText.textContent = error.message;
    ragStatusText.textContent = error.message;
  } finally {
    document.body.classList.add("is-ready");
  }
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    void loadSignals(button.dataset.filter || "all");
  });
});

refreshButton.addEventListener("click", () => {
  void initialize();
});

refreshLiveButton.addEventListener("click", () => {
  void loadLiveOverview(true);
});

assistantForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendAssistantMessage();
});

ragForm.addEventListener("submit", (event) => {
  event.preventDefault();
});

ragAddUrlButton.addEventListener("click", () => {
  void ingestRagSource("url");
});

ragAddTextButton.addEventListener("click", () => {
  void ingestRagSource("text");
});

ragSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void searchKnowledgeBase();
});

ragSourceList.addEventListener("click", (event) => {
  const sourceId = event.target?.dataset?.sourceId;
  if (sourceId) {
    void deleteKnowledgeSource(sourceId);
  }
});

setupHeroVideo();

window.setInterval(() => {
  void loadLiveOverview(false);
}, 60000);

void initialize();

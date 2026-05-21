import { buildBackendUrl } from "./api-base.js";

const sidebar = document.querySelector(".ai-chat-sidebar");
const sidebarToggle = document.querySelector(".ai-sidebar-toggle");
const newChatButton = document.querySelector("#ai-new-chat");
const promptButtons = document.querySelectorAll(".ai-prompt-list button");
const historyList = document.querySelector(".ai-history-list");
const composer = document.querySelector("#ai-composer");
const promptInput = document.querySelector("#ai-prompt");
const messageStream = document.querySelector("#ai-message-stream");
const statusPill = document.querySelector("#ai-status");
const sessionTitle = document.querySelector("#ai-session-title");
const productSelect = document.querySelector("#ai-product-id");
const forceRefreshInput = document.querySelector("#ai-force-refresh");
const sendButton = document.querySelector("#ai-send");
const ragStatusText = document.querySelector("#ai-rag-status");
const ragTitleInput = document.querySelector("#ai-rag-title");
const ragUrlInput = document.querySelector("#ai-rag-url");
const ragTextInput = document.querySelector("#ai-rag-text");
const ragAddUrlButton = document.querySelector("#ai-rag-add-url");
const ragAddTextButton = document.querySelector("#ai-rag-add-text");
const ragSources = document.querySelector("#ai-rag-sources");

const state = {
  sessionId: null,
  isSending: false,
  sessionCount: 1,
};

const directChatTimeoutMs = 180000;
const assistantTypingCharactersPerFrame = 3;
const assistantTypingFrameMs = 12;

function setSidebarOpen(isOpen) {
  if (!(sidebar instanceof HTMLElement) || !(sidebarToggle instanceof HTMLButtonElement)) {
    return;
  }

  sidebar.classList.toggle("is-open", isOpen);
  sidebarToggle.setAttribute("aria-expanded", String(isOpen));
  sidebarToggle.setAttribute("aria-label", isOpen ? "Close sidebar" : "Open sidebar");
}

function setStatus(label, stateName = "ready") {
  if (!(statusPill instanceof HTMLElement)) {
    return;
  }

  statusPill.textContent = label;
  statusPill.className = "ai-status-pill";
  statusPill.classList.add(`is-${stateName}`);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMessageText(value) {
  return escapeHtml(value)
    .split(/\n{2,}/u)
    .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br />")}</p>`)
    .join("");
}

function scrollToLatest() {
  if (messageStream instanceof HTMLElement) {
    messageStream.scrollTop = messageStream.scrollHeight;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(buildBackendUrl(url), options);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.message || payload?.detail || `${response.status} ${response.statusText}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function postJson(url, body, options = {}) {
  return fetchJson(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
}

function extractAssistantAnswer(payload) {
  return (
    payload?.chatResponse?.assistantMessage?.content ||
    payload?.chatResponse?.messages?.findLast?.((item) => item?.role === "assistant")?.content ||
    payload?.assistantMessage?.content ||
    payload?.messages?.findLast?.((item) => item?.role === "assistant")?.content ||
    ""
  );
}

function updateHistoryTitle(title) {
  const activeHistoryButton = historyList?.querySelector("button.is-active strong");
  if (activeHistoryButton instanceof HTMLElement) {
    activeHistoryButton.textContent = title;
  }
}

function renderMessages(messages) {
  if (!(messageStream instanceof HTMLElement)) {
    return;
  }

  messageStream.innerHTML = "";
  const visibleMessages = (Array.isArray(messages) ? messages : []).filter((message) => {
    const content = String(message?.content || "");
    return !(
      message?.role === "assistant" &&
      content.includes("is ready. Ask about a coin, the live market overview")
    );
  });
  visibleMessages.forEach((message) => {
    appendMessage(message?.role === "user" ? "user" : "assistant", message?.content || "");
  });
}

function appendMessage(role, content, options = {}) {
  if (!(messageStream instanceof HTMLElement)) {
    return null;
  }

  const article = document.createElement("article");
  article.className = `ai-message is-${role}`;
  if (options.isPending) {
    article.classList.add("is-pending");
  }

  const avatar = document.createElement("span");
  avatar.className = "ai-avatar";
  avatar.textContent = role === "user" ? "U" : "L";

  const bubble = document.createElement("div");
  bubble.className = "ai-message-bubble";
  bubble.innerHTML = options.isPending
    ? '<div class="ai-typing"><span></span><span></span><span></span></div>'
    : formatMessageText(content);

  article.append(avatar, bubble);
  messageStream.append(article);
  scrollToLatest();
  return article;
}

async function typeAssistantMessage(messageElement, content) {
  const bubble = messageElement?.querySelector(".ai-message-bubble");
  if (!(messageElement instanceof HTMLElement) || !(bubble instanceof HTMLElement)) {
    return;
  }

  messageElement.classList.add("is-streaming");
  bubble.textContent = "";

  for (let index = 0; index < content.length; index += assistantTypingCharactersPerFrame) {
    bubble.textContent += content.slice(index, index + assistantTypingCharactersPerFrame);
    scrollToLatest();
    await sleep(assistantTypingFrameMs);
  }

  messageElement.classList.remove("is-streaming");
  bubble.innerHTML = formatMessageText(content);
  scrollToLatest();
}

function resetComposerHeight() {
  if (!(promptInput instanceof HTMLTextAreaElement)) {
    return;
  }

  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 180)}px`;
}

function renderKnowledgeSources(sources) {
  if (!(ragSources instanceof HTMLElement)) {
    return;
  }

  const sourceRows = Array.isArray(sources) ? sources.slice(0, 4) : [];
  if (!sourceRows.length) {
    ragSources.innerHTML = '<span class="ai-knowledge-empty">No sources yet</span>';
    return;
  }

  ragSources.innerHTML = sourceRows
    .map((source) => {
      const title = escapeHtml(source?.title || "Knowledge source");
      const count = Number(source?.chunkCount || 0);
      return `<span class="ai-knowledge-source"><strong>${title}</strong><small>${count} chunk${count === 1 ? "" : "s"}</small></span>`;
    })
    .join("");
}

async function loadKnowledgePanel() {
  if (!(ragStatusText instanceof HTMLElement)) {
    return;
  }

  try {
    const [status, sourcePayload] = await Promise.all([
      fetchJson("/api/rag/status"),
      fetchJson("/api/rag/sources?limit=4"),
    ]);
    const sourceCount = Number(status?.sourceCount || 0);
    const chunkCount = Number(status?.chunkCount || 0);
    ragStatusText.textContent = `${sourceCount}/${chunkCount}`;
    ragStatusText.title = `Sources: ${sourceCount}, chunks: ${chunkCount}, search: ${status?.searchMode || "unknown"}`;
    renderKnowledgeSources(sourcePayload?.sources || []);
  } catch (error) {
    ragStatusText.textContent = "Offline";
    ragStatusText.title = error instanceof Error ? error.message : String(error);
    renderKnowledgeSources([]);
  }
}

async function ingestKnowledge(kind) {
  if (
    !(ragStatusText instanceof HTMLElement) ||
    !(ragTitleInput instanceof HTMLInputElement) ||
    !(ragUrlInput instanceof HTMLInputElement) ||
    !(ragTextInput instanceof HTMLTextAreaElement)
  ) {
    return;
  }

  const title = ragTitleInput.value.trim();
  const url = ragUrlInput.value.trim();
  const content = ragTextInput.value.trim();

  if (kind === "url" && !url) {
    ragStatusText.textContent = "Need URL";
    return;
  }

  if (kind === "text" && (!title || !content)) {
    ragStatusText.textContent = "Need note";
    return;
  }

  if (ragAddUrlButton instanceof HTMLButtonElement) {
    ragAddUrlButton.disabled = true;
  }
  if (ragAddTextButton instanceof HTMLButtonElement) {
    ragAddTextButton.disabled = true;
  }

  ragStatusText.textContent = "Indexing";
  try {
    if (kind === "url") {
      await postJson("/api/rag/documents/url", {
        url,
        title: title || undefined,
      });
      ragUrlInput.value = "";
    } else {
      await postJson("/api/rag/documents/text", {
        title,
        content,
        sourceUri: url || undefined,
      });
      ragTextInput.value = "";
    }

    ragTitleInput.value = "";
    await loadKnowledgePanel();
    setStatus("Ready", "ready");
  } catch (error) {
    ragStatusText.textContent = "Error";
    appendMessage("assistant", error instanceof Error ? error.message : "Knowledge ingestion failed.");
  } finally {
    if (ragAddUrlButton instanceof HTMLButtonElement) {
      ragAddUrlButton.disabled = false;
    }
    if (ragAddTextButton instanceof HTMLButtonElement) {
      ragAddTextButton.disabled = false;
    }
  }
}

async function createSession() {
  const payload = await postJson("/api/chat/sessions", { title: "Lunatrix AI chat" });
  state.sessionId = payload?.session?.sessionId || payload?.session?.id || null;
  if (!state.sessionId) {
    throw new Error("Backend did not return a chat session id.");
  }

  if (sessionTitle instanceof HTMLElement && payload?.session?.title) {
    sessionTitle.textContent = payload.session.title;
    updateHistoryTitle(payload.session.title);
  }

  renderMessages(payload?.messages || []);
}

async function sendPromptDirect(sessionId, body) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, directChatTimeoutMs);

  try {
    return await postJson(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, body, {
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("The assistant timed out while reading model context.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function sendPrompt(message) {
  if (state.isSending) {
    return;
  }

  state.isSending = true;
  if (sendButton instanceof HTMLButtonElement) {
    sendButton.disabled = true;
  }
  setStatus("Thinking", "busy");
  appendMessage("user", message);
  const pendingMessage = appendMessage("assistant", "", { isPending: true });

  try {
    if (!state.sessionId) {
      await createSession();
    }

    const productId = productSelect instanceof HTMLSelectElement ? productSelect.value : "";
    const forceRefresh = forceRefreshInput instanceof HTMLInputElement ? forceRefreshInput.checked : false;
    setStatus("Reading", "busy");
    const payload = await sendPromptDirect(state.sessionId, {
      message,
      productId: productId || undefined,
      forceRefresh,
    });

    const answer = extractAssistantAnswer(payload) || "I received the prompt, but the assistant returned no text.";

    pendingMessage?.classList.remove("is-pending");
    setStatus("Typing", "busy");
    if (pendingMessage instanceof HTMLElement) {
      await typeAssistantMessage(pendingMessage, answer);
    }
    setStatus("Ready", "ready");
  } catch (error) {
    pendingMessage?.classList.remove("is-pending");
    const bubble = pendingMessage?.querySelector(".ai-message-bubble");
    if (bubble instanceof HTMLElement) {
      bubble.innerHTML = formatMessageText(
        error instanceof Error ? error.message : "The assistant is unavailable right now.",
      );
    }
    setStatus("Offline", "error");
  } finally {
    state.isSending = false;
    if (sendButton instanceof HTMLButtonElement) {
      sendButton.disabled = false;
    }
    promptInput?.focus();
    scrollToLatest();
  }
}

if (sidebarToggle instanceof HTMLButtonElement) {
  sidebarToggle.addEventListener("click", () => {
    setSidebarOpen(!sidebar?.classList.contains("is-open"));
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setSidebarOpen(false);
  }

  if (event.key === "Enter" && !event.shiftKey && document.activeElement === promptInput) {
    event.preventDefault();
    composer?.dispatchEvent(new Event("submit", { cancelable: true }));
  }
});

window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 760px)").matches) {
    setSidebarOpen(false);
  }
});

if (promptInput instanceof HTMLTextAreaElement) {
  promptInput.addEventListener("input", resetComposerHeight);
}

if (composer instanceof HTMLFormElement && promptInput instanceof HTMLTextAreaElement) {
  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = promptInput.value.trim();
    if (!message) {
      return;
    }

    promptInput.value = "";
    resetComposerHeight();
    void sendPrompt(message);
  });
}

if (newChatButton instanceof HTMLButtonElement && messageStream instanceof HTMLElement) {
  newChatButton.addEventListener("click", () => {
    state.sessionId = null;
    state.sessionCount += 1;
    const nextTitle = `Market intelligence chat ${state.sessionCount}`;
    if (sessionTitle instanceof HTMLElement) {
      sessionTitle.textContent = "Lunatrix AI";
    }
    updateHistoryTitle(nextTitle);
    setStatus("Starting", "busy");
    void createSession()
      .then(() => {
        setStatus("Ready", "ready");
      })
      .catch((error) => {
        renderMessages([
          {
            role: "assistant",
            content: error instanceof Error ? error.message : "Could not start model chat session.",
          },
        ]);
        setStatus("Offline", "error");
      });
  });
}

promptButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (promptInput instanceof HTMLTextAreaElement) {
      promptInput.value = button.textContent?.trim() || "";
      resetComposerHeight();
      promptInput.focus();
    }
  });
});

setStatus("Starting", "busy");
void loadKnowledgePanel();
void createSession()
  .then(() => {
    setStatus("Ready", "ready");
  })
  .catch((error) => {
    renderMessages([
      {
        role: "assistant",
        content: error instanceof Error ? error.message : "Could not start model chat session.",
      },
    ]);
    setStatus("Offline", "error");
  });

if (ragAddUrlButton instanceof HTMLButtonElement) {
  ragAddUrlButton.addEventListener("click", () => {
    void ingestKnowledge("url");
  });
}

if (ragAddTextButton instanceof HTMLButtonElement) {
  ragAddTextButton.addEventListener("click", () => {
    void ingestKnowledge("text");
  });
}

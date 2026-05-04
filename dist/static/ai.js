import { buildBackendUrl } from "./api-base.js";

const sidebar = document.querySelector(".ai-chat-sidebar");
const sidebarToggle = document.querySelector(".ai-sidebar-toggle");
const newChatButton = document.querySelector("#ai-new-chat");
const promptButtons = document.querySelectorAll(".ai-prompt-list button");
const composer = document.querySelector("#ai-composer");
const promptInput = document.querySelector("#ai-prompt");
const messageStream = document.querySelector("#ai-message-stream");
const statusPill = document.querySelector("#ai-status");
const sessionTitle = document.querySelector("#ai-session-title");
const productSelect = document.querySelector("#ai-product-id");
const forceRefreshInput = document.querySelector("#ai-force-refresh");
const sendButton = document.querySelector("#ai-send");

const state = {
  sessionId: null,
  isSending: false,
};

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

function resetComposerHeight() {
  if (!(promptInput instanceof HTMLTextAreaElement)) {
    return;
  }

  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 180)}px`;
}

async function createSession() {
  const response = await fetch(buildBackendUrl("/api/chat/sessions"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "Lunatrix AI chat" }),
  });

  if (!response.ok) {
    throw new Error(`Session failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  state.sessionId = payload?.session?.sessionId || payload?.session?.id || null;
  if (!state.sessionId) {
    throw new Error("Backend did not return a chat session id.");
  }

  if (sessionTitle instanceof HTMLElement && payload?.session?.title) {
    sessionTitle.textContent = payload.session.title;
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
    const response = await fetch(buildBackendUrl(`/api/chat/sessions/${encodeURIComponent(state.sessionId)}/messages`), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        productId: productId || undefined,
        forceRefresh,
      }),
    });

    if (!response.ok) {
      throw new Error(`Assistant failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const answer =
      payload?.assistantMessage?.content ||
      payload?.messages?.findLast?.((item) => item?.role === "assistant")?.content ||
      "I received the prompt, but the assistant returned no text.";

    pendingMessage?.classList.remove("is-pending");
    const bubble = pendingMessage?.querySelector(".ai-message-bubble");
    if (bubble instanceof HTMLElement) {
      bubble.innerHTML = formatMessageText(answer);
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
    messageStream.innerHTML = "";
    appendMessage(
      "assistant",
      "How can I help with the market today?",
    );
    setStatus("Ready", "ready");
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

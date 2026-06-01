import { buildBackendUrl } from "./api-base.js";

const authStorageKey = "lunatrix.auth.session.v1";
const selectedPlanStorageKey = "lunatrix.auth.plan.v1";
const selectedPlansByUserStorageKey = "lunatrix.auth.plansByUser.v1";
const selectedBillingStorageKey = "lunatrix.auth.billing.v1";
const validPlanChoices = new Set(["free", "plus", "pro"]);

function getJwtExpiresAtMs(token) {
  if (typeof token !== "string" || token.split(".").length !== 3) {
    return null;
  }

  try {
    const encodedPayload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = encodedPayload.padEnd(encodedPayload.length + ((4 - (encodedPayload.length % 4)) % 4), "=");
    const payload = JSON.parse(window.atob(paddedPayload));
    const expiresAtSeconds = Number(payload?.exp);
    return Number.isFinite(expiresAtSeconds) ? expiresAtSeconds * 1000 : null;
  } catch {
    return null;
  }
}

function isSessionExpired(session) {
  const explicitExpiresAtMs = Date.parse(String(session?.expiresAt || ""));
  const jwtExpiresAtMs = getJwtExpiresAtMs(session?.token);
  const expiresAtMs = Number.isFinite(explicitExpiresAtMs) ? explicitExpiresAtMs : jwtExpiresAtMs;
  return Number.isFinite(expiresAtMs) && Date.now() >= expiresAtMs;
}

export function getStoredAuthSession() {
  try {
    const rawValue = window.localStorage?.getItem(authStorageKey);
    const session = rawValue ? JSON.parse(rawValue) : null;
    if (session?.token && isSessionExpired(session)) {
      clearAuthSession();
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  const session = getStoredAuthSession();
  return typeof session?.token === "string" ? session.token : "";
}

export function getAuthHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function storeAuthSession(session) {
  window.localStorage?.setItem(authStorageKey, JSON.stringify(session));
}

export function clearAuthSession() {
  window.localStorage?.removeItem(authStorageKey);
}

export function requireAuthSession() {
  const session = getStoredAuthSession();
  if (!session?.token) {
    const redirectTo = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.assign(`/login?redirect=${redirectTo}`);
    return null;
  }

  return session;
}

async function submitAuthRequest(pathname, body) {
  const response = await fetch(buildBackendUrl(pathname), {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || payload?.detail || `${response.status} ${response.statusText}`);
  }

  storeAuthSession(payload);
  return payload;
}

function resolveRedirectTarget() {
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  if (!redirect || !redirect.startsWith("/")) {
    return "/signals";
  }

  return redirect;
}

function normalizePlanChoice(plan) {
  const normalizedPlan = String(plan || "").trim().toLowerCase();
  if (normalizedPlan === "paid") {
    return "plus";
  }

  return validPlanChoices.has(normalizedPlan) ? normalizedPlan : "";
}

function getAuthUserKey(session = getStoredAuthSession()) {
  return String(session?.user?.id || session?.user?.email || "").trim().toLowerCase();
}

function readStoredPlan(storageKey) {
  try {
    const rawPlan = window.localStorage?.getItem(storageKey);
    const selectedPlan = rawPlan ? JSON.parse(rawPlan) : null;
    const normalizedPlan = normalizePlanChoice(selectedPlan?.plan);
    return normalizedPlan ? { ...selectedPlan, plan: normalizedPlan } : null;
  } catch {
    return null;
  }
}

function readUserPlans() {
  try {
    const rawPlans = window.localStorage?.getItem(selectedPlansByUserStorageKey);
    const plansByUser = rawPlans ? JSON.parse(rawPlans) : {};
    return plansByUser && typeof plansByUser === "object" ? plansByUser : {};
  } catch {
    return {};
  }
}

function writeUserPlan(userKey, selectedPlan) {
  if (!userKey || !selectedPlan?.plan) {
    return;
  }

  const plansByUser = readUserPlans();
  plansByUser[userKey] = selectedPlan;
  window.localStorage?.setItem(selectedPlansByUserStorageKey, JSON.stringify(plansByUser));
}

function storeSelectedPlan(selectedPlan) {
  const normalizedPlan = normalizePlanChoice(selectedPlan?.plan);
  if (!normalizedPlan) {
    return;
  }

  const normalizedSelection = {
    ...selectedPlan,
    plan: normalizedPlan,
  };
  window.localStorage?.setItem(selectedPlanStorageKey, JSON.stringify(normalizedSelection));
  writeUserPlan(getAuthUserKey(), normalizedSelection);
}

function getSelectedPlan(session = getStoredAuthSession()) {
  const userKey = getAuthUserKey(session);
  const userPlan = userKey ? readUserPlans()[userKey] : null;
  const normalizedUserPlan = normalizePlanChoice(userPlan?.plan);
  if (normalizedUserPlan) {
    return { ...userPlan, plan: normalizedUserPlan };
  }

  const legacyPlan = readStoredPlan(selectedPlanStorageKey);
  if (legacyPlan && userKey) {
    writeUserPlan(userKey, legacyPlan);
  }

  return legacyPlan;
}

function hasSelectedPlan(session = getStoredAuthSession()) {
  return Boolean(getSelectedPlan(session));
}

function resolvePostLoginTarget(session = getStoredAuthSession()) {
  return hasSelectedPlan(session) ? resolveRedirectTarget() : "/plans";
}

function redirectAuthenticatedAuthPage() {
  const form = document.querySelector("[data-auth-form]");
  if (!(form instanceof HTMLFormElement) || !getAuthToken()) {
    return false;
  }

  window.location.replace(resolvePostLoginTarget());
  return true;
}

function bindAuthForm() {
  if (redirectAuthenticatedAuthPage()) {
    return;
  }

  const form = document.querySelector("[data-auth-form]");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const mode = form.dataset.authForm;
  const message = document.querySelector("[data-auth-message]");
  const submitButton = form.querySelector("button[type='submit']");
  const loginSuccess = document.querySelector("[data-login-success]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
    }
    if (message) {
      message.textContent = mode === "signup" ? "Creating your account..." : "Signing you in...";
    }

    const formData = new FormData(form);
    const body = {
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
    };
    if (mode === "signup") {
      body.name = String(formData.get("name") || "");
    }

    try {
      const session = await submitAuthRequest(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", body);
      if (mode === "signup") {
        window.location.assign("/plans");
        return;
      }

      if (mode === "login" && loginSuccess instanceof HTMLElement) {
        loginSuccess.hidden = false;
        window.setTimeout(() => {
          window.location.assign(resolvePostLoginTarget(session));
        }, 900);
        return;
      }

      window.location.assign(resolvePostLoginTarget(session));
    } catch (error) {
      if (message) {
        message.textContent = error instanceof Error ? error.message : "Authentication failed.";
      }
    } finally {
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
      }
    }
  });
}

function bindPlanButtons(planPanel = document) {
  if (document.body?.classList.contains("page-plans") && !getAuthToken()) {
    window.location.assign(`/login?redirect=${encodeURIComponent("/plans")}`);
    return;
  }

  if (document.body?.classList.contains("page-plans") && hasSelectedPlan()) {
    window.location.replace(resolveRedirectTarget());
    return;
  }

  if (document.body?.dataset.planHandlerBound === "true") {
    return;
  }

  document.body.dataset.planHandlerBound = "true";
  planPanel.addEventListener("click", (event) => {
    const clickedElement = event.target;
    const button = clickedElement instanceof Element ? clickedElement.closest("[data-plan-choice]") : null;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    event.preventDefault();
    const buttons = planPanel.querySelectorAll("[data-plan-choice]");
    buttons.forEach((candidateButton) => {
      if (candidateButton instanceof HTMLButtonElement) {
        candidateButton.disabled = true;
      }
    });

    button.classList.add("is-loading");
    const selectedPlan = normalizePlanChoice(button.dataset.planChoice) || "free";
    const selectedBilling = getSelectedBilling();
    storeSelectedPlan({
      plan: selectedPlan,
      billing: selectedBilling,
      selectedAt: new Date().toISOString(),
    });

    window.setTimeout(() => {
      if (selectedPlan === "free") {
        window.location.assign(resolveRedirectTarget());
        return;
      }

      window.location.assign(`/checkout?plan=${encodeURIComponent(selectedPlan)}&billing=${encodeURIComponent(selectedBilling)}`);
    }, 300);
  });
}

function getSelectedBilling() {
  try {
    const rawBilling = window.localStorage?.getItem(selectedBillingStorageKey);
    return rawBilling === "monthly" || rawBilling === "annual" ? rawBilling : "annual";
  } catch {
    return "annual";
  }
}

function bindBillingToggle() {
  const toggle = document.querySelector(".pricing-toggle");
  if (!(toggle instanceof HTMLElement)) {
    return;
  }

  const buttons = toggle.querySelectorAll("[data-billing-option]");
  const activeBilling = getSelectedBilling();
  buttons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.classList.toggle("is-active", button.dataset.billingOption === activeBilling);

    button.addEventListener("click", () => {
      buttons.forEach((candidateButton) => {
        candidateButton.classList.toggle("is-active", candidateButton === button);
      });
      window.localStorage?.setItem(selectedBillingStorageKey, button.dataset.billingOption || "annual");
    });
  });
}

function bindCheckoutButton() {
  hydrateCheckoutSummary();

  if (document.body?.classList.contains("page-checkout") && !getAuthToken()) {
    const redirectTo = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.assign(`/login?redirect=${redirectTo}`);
    return;
  }

  const checkoutButton = document.querySelector("[data-crypto-checkout]");
  if (!(checkoutButton instanceof HTMLButtonElement)) {
    return;
  }

  checkoutButton.addEventListener("click", () => {
    checkoutButton.disabled = true;
    checkoutButton.classList.add("is-loading");
    window.setTimeout(() => {
      window.location.assign(resolveRedirectTarget());
    }, 900);
  });
}

function hydrateCheckoutSummary() {
  const planName = document.querySelector("[data-checkout-plan]");
  const billingName = document.querySelector("[data-checkout-billing]");
  const amount = document.querySelector("[data-checkout-amount]");
  const query = new URLSearchParams(window.location.search);
  const plan = query.get("plan") || "plus";
  const billing = query.get("billing") === "monthly" ? "monthly" : "annual";
  const planLabels = {
    plus: "Plus",
    pro: "Pro",
  };
  const prices = {
    plus: { annual: "$182/year", monthly: "$19/month" },
    pro: { annual: "$470/year", monthly: "$49/month" },
  };
  const normalizedPlan = plan === "pro" ? "pro" : "plus";

  if (planName) {
    planName.textContent = `${planLabels[normalizedPlan]} plan`;
  }
  if (billingName) {
    billingName.textContent = billing === "monthly" ? "Monthly" : "Annual";
  }
  if (amount) {
    amount.textContent = prices[normalizedPlan][billing];
  }
}

bindAuthForm();
bindPlanButtons();
bindBillingToggle();
bindCheckoutButton();

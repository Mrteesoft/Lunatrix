import { buildBackendUrl } from "./api-base.js";

const authStorageKey = "lunatrix.auth.session.v1";
const selectedPlanStorageKey = "lunatrix.auth.plan.v1";
const selectedBillingStorageKey = "lunatrix.auth.billing.v1";

export function getStoredAuthSession() {
  try {
    const rawValue = window.localStorage?.getItem(authStorageKey);
    return rawValue ? JSON.parse(rawValue) : null;
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

function hasSelectedPlan() {
  try {
    const rawPlan = window.localStorage?.getItem(selectedPlanStorageKey);
    const selectedPlan = rawPlan ? JSON.parse(rawPlan) : null;
    return ["free", "plus", "pro"].includes(selectedPlan?.plan);
  } catch {
    return false;
  }
}

function resolvePostLoginTarget() {
  return hasSelectedPlan() ? resolveRedirectTarget() : "/plans";
}

function bindAuthForm() {
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
      await submitAuthRequest(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", body);
      if (mode === "signup") {
        window.location.assign("/plans");
        return;
      }

      if (mode === "login" && loginSuccess instanceof HTMLElement) {
        loginSuccess.hidden = false;
        window.setTimeout(() => {
          window.location.assign(resolvePostLoginTarget());
        }, 900);
        return;
      }

      window.location.assign(resolvePostLoginTarget());
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
    const selectedPlan = button.dataset.planChoice || "free";
    const selectedBilling = getSelectedBilling();
    window.localStorage?.setItem(
      selectedPlanStorageKey,
      JSON.stringify({
        plan: selectedPlan,
        billing: selectedBilling,
        selectedAt: new Date().toISOString(),
      }),
    );

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

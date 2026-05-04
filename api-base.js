function resolveConfiguredBackendBaseUrl() {
  const configuredBaseUrl = document.body?.dataset?.backendBaseUrl?.trim();
  if (!configuredBaseUrl) {
    const runtimeConfigBaseUrl = window.LUNATRIX_CONFIG?.backendBaseUrl?.trim();
    if (!runtimeConfigBaseUrl) {
      return null;
    }

    return new URL(runtimeConfigBaseUrl, window.location.href);
  }

  return new URL(configuredBaseUrl, window.location.href);
}

export function resolveBackendBaseUrl() {
  const configuredBaseUrl = resolveConfiguredBackendBaseUrl();
  if (configuredBaseUrl !== null) {
    return configuredBaseUrl;
  }

  const currentUrl = new URL(window.location.href);
  if (currentUrl.port === "4173") {
    currentUrl.port = "8000";
  }

  return new URL(currentUrl.origin);
}

export function buildBackendUrl(pathname) {
  try {
    return new URL(pathname).toString();
  } catch {
    return new URL(pathname, resolveBackendBaseUrl()).toString();
  }
}

export function buildBackendWebSocketUrl(pathname) {
  const websocketUrl = new URL(buildBackendUrl(pathname));
  websocketUrl.protocol = websocketUrl.protocol === "https:" ? "wss:" : "ws:";
  return websocketUrl.toString();
}

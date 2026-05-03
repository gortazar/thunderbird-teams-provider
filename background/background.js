/**
 * Thunderbird Teams Provider - Background Script
 *
 * Handles:
 *  - Microsoft Teams OAuth 2.0 + PKCE authentication
 *  - Microsoft Graph API calls (chats, messages, send)
 *  - Periodic polling for new messages (every 30 s)
 *  - Spaces-toolbar button with unread badge
 *  - Message passing to/from the popup panel
 */

"use strict";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const POLL_INTERVAL_MS = 30_000;

// Client ID of this extension's registered Azure AD application.
// End-users do NOT need to touch this — authentication works out of the box,
// exactly like Thunderbird's built-in Microsoft mail support.
// An organisation that wants to use their own app registration can override it
// via the Options page (Advanced section).
//
// Developers: register a public-client (no client secret) Azure AD app with
// delegated permissions Chat.ReadWrite, User.Read and offline_access, then
// replace this placeholder with the Application (client) ID before publishing.
const DEFAULT_CLIENT_ID = "YOUR_EXTENSION_CLIENT_ID_HERE";

// ---------------------------------------------------------------------------
// Runtime state (reset on service-worker restart)
// ---------------------------------------------------------------------------
let accessToken = null;
let refreshToken = null;
let tokenExpiry = 0;       // tracked in-memory to avoid extra storage reads
let settings = {};
let cachedChats = [];
let unreadChatIds = new Set();
let pollTimer = null;
let spacesButtonId = null;

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------
async function loadSettings() {
  settings = await messenger.storage.local.get([
    "clientId",
    "tenantId",
    "disableAvatars",
    "accessToken",
    "refreshToken",
    "tokenExpiry",
    "lastReadTimes",
    "currentUser",
  ]);
  if (settings.accessToken) {
    accessToken = settings.accessToken;
    refreshToken = settings.refreshToken;
    tokenExpiry = settings.tokenExpiry || 0;
  }
}

// ---------------------------------------------------------------------------
// OAuth 2.0 + PKCE authentication
// ---------------------------------------------------------------------------
async function authenticate() {
  // Prefer an org-specific Client ID configured in Options; fall back to the
  // extension's own registered default (just like Thunderbird uses its own
  // registered app ID for Microsoft email — no Azure setup required by users).
  const clientId = settings.clientId || DEFAULT_CLIENT_ID;
  const tenantId = settings.tenantId || "common";

  if (!clientId || clientId === "YOUR_EXTENSION_CLIENT_ID_HERE") {
    throw new Error(
      "This build has no Client ID configured. " +
      "Please enter one in the extension options, or contact the maintainer."
    );
  }

  const redirectURL = messenger.identity.getRedirectURL();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  // Random state value for CSRF protection
  const state = generateCodeVerifier();

  const authURL =
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectURL)}` +
    `&scope=${encodeURIComponent(
      "Chat.ReadWrite User.Read offline_access"
    )}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256` +
    `&state=${state}` +
    `&prompt=select_account`;

  const resultURL = await messenger.identity.launchWebAuthFlow({
    url: authURL,
    interactive: true,
  });

  const url = new URL(resultURL);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (returnedState !== state) {
    throw new Error("State mismatch – possible CSRF attack. Aborting.");
  }

  await exchangeCodeForTokens(clientId, tenantId, code, redirectURL, codeVerifier);
  await cacheCurrentUser();
  startPolling();
  return true;
}

async function exchangeCodeForTokens(
  clientId,
  tenantId,
  code,
  redirectURL,
  codeVerifier
) {
  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        code,
        redirect_uri: redirectURL,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
        scope: "Chat.ReadWrite User.Read offline_access",
      }),
    }
  );

  const tokens = await response.json();
  if (tokens.error) {
    throw new Error(`Token error: ${tokens.error_description}`);
  }

  await storeTokens(tokens);
}

async function refreshAccessToken() {
  if (!refreshToken) {
    throw new Error("No refresh token available. Please sign in again.");
  }

  const clientId = settings.clientId;
  const tenantId = settings.tenantId || "common";

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: "Chat.ReadWrite User.Read offline_access",
      }),
    }
  );

  const tokens = await response.json();
  if (tokens.error) {
    // Invalidate stored tokens so the user knows they need to sign in again
    accessToken = null;
    refreshToken = null;
    await messenger.storage.local.remove([
      "accessToken",
      "refreshToken",
      "tokenExpiry",
    ]);
    throw new Error(`Token refresh failed: ${tokens.error_description}`);
  }

  await storeTokens(tokens);
}

async function storeTokens(tokens) {
  accessToken = tokens.access_token;
  if (tokens.refresh_token) {
    refreshToken = tokens.refresh_token;
  }
  const expiry = Date.now() + tokens.expires_in * 1000;
  tokenExpiry = expiry;
  await messenger.storage.local.set({
    accessToken,
    refreshToken,
    tokenExpiry: expiry,
  });
}

// ---------------------------------------------------------------------------
// Graph API helper
// ---------------------------------------------------------------------------
async function apiCall(endpoint, options = {}) {
  // Proactively refresh if < 60 s remain (use in-memory expiry to avoid storage reads)
  if (tokenExpiry && Date.now() > tokenExpiry - 60_000) {
    await refreshAccessToken();
  }

  const doFetch = (token) =>
    fetch(`${GRAPH_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

  let response = await doFetch(accessToken);

  if (response.status === 401) {
    // One retry after refresh
    await refreshAccessToken();
    response = await doFetch(accessToken);
  }

  return response;
}

// ---------------------------------------------------------------------------
// Graph API – Teams operations
// ---------------------------------------------------------------------------
async function getChats() {
  const response = await apiCall(
    "/me/chats?$expand=members&$orderby=lastMessagePreview/createdDateTime+desc&$top=50"
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.value || [];
}

async function getMessages(chatId) {
  const response = await apiCall(
    `/chats/${encodeURIComponent(chatId)}/messages?$top=50`
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  // Reverse so oldest message appears first
  return (data.value || []).reverse();
}

async function sendMessage(chatId, content) {
  const response = await apiCall(
    `/chats/${encodeURIComponent(chatId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        body: { content, contentType: "text" },
      }),
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }
  return response.json();
}

async function cacheCurrentUser() {
  try {
    const response = await apiCall("/me");
    if (response.ok) {
      const user = await response.json();
      await messenger.storage.local.set({ currentUser: user });
      settings.currentUser = user;
    }
  } catch (_) {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Unread-tracking helpers
// ---------------------------------------------------------------------------
async function computeUnreadChats(chats) {
  const stored = await messenger.storage.local.get([
    "lastReadTimes",
    "currentUser",
  ]);
  const lastReadTimes = stored.lastReadTimes || {};
  const currentUserId = stored.currentUser?.id;
  const newUnread = new Set();

  for (const chat of chats) {
    const preview = chat.lastMessagePreview;
    if (!preview) continue;
    const msgTime = new Date(preview.createdDateTime).getTime();
    const lastRead = lastReadTimes[chat.id]
      ? new Date(lastReadTimes[chat.id]).getTime()
      : 0;
    // Only count as unread if the last message is not from ourselves
    const fromId = preview.from?.user?.id;
    if (msgTime > lastRead && fromId !== currentUserId) {
      newUnread.add(chat.id);
    }
  }

  return newUnread;
}

// ---------------------------------------------------------------------------
// Spaces-toolbar badge
// ---------------------------------------------------------------------------
async function updateBadge(unreadCount) {
  if (!spacesButtonId) return;
  try {
    await messenger.spacesToolbar.setIcons(spacesButtonId, {
      badgeText: unreadCount > 0 ? String(unreadCount) : "",
    });
  } catch (_) {
    // Badge update is best-effort
  }
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------
async function pollForUpdates() {
  if (!accessToken) return;

  try {
    const chats = await getChats();
    cachedChats = chats;
    unreadChatIds = await computeUnreadChats(chats);
    await updateBadge(unreadChatIds.size);
    notifyPopup({ action: "chatsUpdated", chats, unreadChatIds: [...unreadChatIds] });
  } catch (err) {
    console.error("[teams-provider] poll error:", err);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollForUpdates();
  pollTimer = setInterval(pollForUpdates, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Push notification to the popup (best-effort)
// ---------------------------------------------------------------------------
function notifyPopup(message) {
  messenger.runtime.sendMessage(message).catch(() => {});
}

// ---------------------------------------------------------------------------
// Message handler (popup → background)
// ---------------------------------------------------------------------------
messenger.runtime.onMessage.addListener(async (message) => {
  switch (message.action) {
    case "getStatus":
      return {
        authenticated: Boolean(accessToken),
        chats: cachedChats,
        unreadChatIds: [...unreadChatIds],
      };

    case "authenticate": {
      try {
        await authenticate();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case "signOut": {
      accessToken = null;
      refreshToken = null;
      stopPolling();
      cachedChats = [];
      unreadChatIds = new Set();
      await messenger.storage.local.remove([
        "accessToken",
        "refreshToken",
        "tokenExpiry",
        "currentUser",
      ]);
      notifyPopup({ action: "signedOut" });
      return { success: true };
    }

    case "getChats": {
      if (!accessToken) return { error: "Not authenticated" };
      try {
        const chats = await getChats();
        cachedChats = chats;
        unreadChatIds = await computeUnreadChats(chats);
        return { chats, unreadChatIds: [...unreadChatIds] };
      } catch (err) {
        return { error: err.message };
      }
    }

    case "getMessages": {
      if (!accessToken) return { error: "Not authenticated" };
      try {
        const msgs = await getMessages(message.chatId);
        return { messages: msgs };
      } catch (err) {
        return { error: err.message };
      }
    }

    case "sendMessage": {
      if (!accessToken) return { error: "Not authenticated" };
      try {
        await sendMessage(message.chatId, message.content);
        // Mark this chat as read after sending
        await markChatRead(message.chatId);
        return { success: true };
      } catch (err) {
        return { error: err.message };
      }
    }

    case "markAsRead": {
      try {
        await markChatRead(message.chatId);
        return { success: true };
      } catch (err) {
        return { error: err.message };
      }
    }

    case "settingsUpdated": {
      await loadSettings();
      return { success: true };
    }
  }
});

async function markChatRead(chatId) {
  const stored = await messenger.storage.local.get("lastReadTimes");
  const lastReadTimes = stored.lastReadTimes || {};
  lastReadTimes[chatId] = new Date().toISOString();
  await messenger.storage.local.set({ lastReadTimes });
  unreadChatIds.delete(chatId);
  await updateBadge(unreadChatIds.size);
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
async function init() {
  await loadSettings();

  // Register the spaces-toolbar button
  try {
    spacesButtonId = await messenger.spacesToolbar.addButton("teams_chat", {
      title: "Microsoft Teams",
      url: messenger.runtime.getURL("popup/teams.html"),
      defaultIcons: {
        16: "icons/teams-16.svg",
        32: "icons/teams-32.svg",
      },
      badgeText: "",
      badgeBackgroundColor: "#E8423F", // Standard notification-red for unread badge
    });
  } catch (err) {
    console.warn("[teams-provider] spacesToolbar.addButton:", err);
  }

  if (accessToken) {
    startPolling();
  }
}

init().catch(console.error);

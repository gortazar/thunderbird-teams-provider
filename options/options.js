"use strict";

const clientIdInput = document.getElementById("client-id");
const tenantIdInput = document.getElementById("tenant-id");
const disableAvatarsInput = document.getElementById("disable-avatars");
const saveBtn = document.getElementById("save-btn");
const saveNotice = document.getElementById("save-notice");
const saveError = document.getElementById("save-error");
const authLabel = document.getElementById("auth-label");
const signinBtn = document.getElementById("signin-btn");
const signoutBtn = document.getElementById("signout-btn");

// ── Load stored settings ────────────────────────────────────────────────────
async function loadSettings() {
  const stored = await messenger.storage.local.get([
    "clientId",
    "tenantId",
    "disableAvatars",
    "accessToken",
  ]);

  clientIdInput.value = stored.clientId || "";
  tenantIdInput.value = stored.tenantId || "";
  disableAvatarsInput.checked = stored.disableAvatars === true;

  updateAuthUI(Boolean(stored.accessToken));
}

// ── Auth UI helpers ─────────────────────────────────────────────────────────
function updateAuthUI(isSignedIn) {
  if (isSignedIn) {
    authLabel.textContent = "You are signed in.";
    signinBtn.hidden = true;
    signoutBtn.hidden = false;
  } else {
    authLabel.textContent = "Not signed in.";
    signinBtn.hidden = false;
    signoutBtn.hidden = true;
  }
}

// ── Save settings ────────────────────────────────────────────────────────────
async function saveSettings() {
  hideNotices();

  // Client ID is optional – blank means "use the extension's built-in default"
  await messenger.storage.local.set({
    clientId: clientIdInput.value.trim(),
    tenantId: tenantIdInput.value.trim(),
    disableAvatars: disableAvatarsInput.checked,
  });

  // Tell background to reload settings
  messenger.runtime.sendMessage({ action: "settingsUpdated" }).catch(() => {});

  showSuccess("Settings saved.");
}

// ── Sign in ──────────────────────────────────────────────────────────────────
signinBtn.addEventListener("click", async () => {
  // Save any values in the Advanced fields first so background has them
  await messenger.storage.local.set({
    clientId: clientIdInput.value.trim(),
    tenantId: tenantIdInput.value.trim(),
    disableAvatars: disableAvatarsInput.checked,
  });
  messenger.runtime.sendMessage({ action: "settingsUpdated" }).catch(() => {});

  hideNotices();
  signinBtn.disabled = true;
  signinBtn.textContent = "Signing in…";

  const resp = await messenger.runtime.sendMessage({ action: "authenticate" });
  signinBtn.disabled = false;
  signinBtn.textContent = "Sign in with Microsoft";

  if (resp?.success) {
    updateAuthUI(true);
    showSuccess("Signed in successfully.");
  } else {
    showError(resp?.error || "Authentication failed. Try again or check the Advanced settings.");
  }
});

// ── Sign out ─────────────────────────────────────────────────────────────────
signoutBtn.addEventListener("click", async () => {
  await messenger.runtime.sendMessage({ action: "signOut" });
  updateAuthUI(false);
  showSuccess("Signed out.");
});

// ── Save button ───────────────────────────────────────────────────────────────
saveBtn.addEventListener("click", saveSettings);

// ── Notice helpers ────────────────────────────────────────────────────────────
function showSuccess(text) {
  saveNotice.textContent = text;
  saveNotice.hidden = false;
  saveError.hidden = true;
  setTimeout(() => { saveNotice.hidden = true; }, 4000);
}

function showError(text) {
  saveError.textContent = text;
  saveError.hidden = false;
  saveNotice.hidden = true;
}

function hideNotices() {
  saveNotice.hidden = true;
  saveError.hidden = true;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
loadSettings().catch(console.error);

/**
 * Thunderbird Teams Provider – Popup/Panel Script
 *
 * Manages:
 *  - Authentication state display
 *  - Chat list rendering (unread chats shown in bold)
 *  - Message thread rendering (avatars or initials based on options)
 *  - Compose area with send-on-Enter
 *  - Receiving push updates from the background script
 */

"use strict";

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const signinScreen = document.getElementById("signin-screen");
const loadingScreen = document.getElementById("loading-screen");
const mainScreen = document.getElementById("main-screen");
const signinBtn = document.getElementById("signin-btn");
const signinError = document.getElementById("signin-error");
const openOptionsLink = document.getElementById("open-options-link");
const signoutBtn = document.getElementById("signout-btn");
const refreshBtn = document.getElementById("refresh-btn");
const chatList = document.getElementById("chat-list");
const chatTitle = document.getElementById("chat-title");
const messagesContainer = document.getElementById("messages-container");
const composeInput = document.getElementById("compose-input");
const sendBtn = document.getElementById("send-btn");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentChatId = null;
let currentChats = [];
let unreadSet = new Set();
let disableAvatars = false;
let currentUser = null;
let messagePollingTimer = null;

// ---------------------------------------------------------------------------
// Avatar / initials helpers
// ---------------------------------------------------------------------------
const AVATAR_COLORS = [
  "#2266D1", "#9C27B0", "#E53935", "#00897B",
  "#43A047", "#FB8C00", "#8E24AA", "#039BE5",
  "#6D4C41", "#546E7A", "#00ACC1", "#7CB342",
];

function getInitials(displayName) {
  if (!displayName) return "?";
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return displayName.substring(0, 2).toUpperCase();
}

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function createAvatarElement(displayName, photoUrl) {
  const el = document.createElement("div");
  el.className = "avatar";
  if (!disableAvatars && photoUrl) {
    const img = document.createElement("img");
    img.src = photoUrl;
    img.alt = displayName || "";
    img.onerror = () => {
      img.remove();
      el.textContent = getInitials(displayName);
      el.style.backgroundColor = getAvatarColor(displayName);
    };
    el.appendChild(img);
  } else {
    el.textContent = getInitials(displayName);
    el.style.backgroundColor = getAvatarColor(displayName);
  }
  return el;
}

// ---------------------------------------------------------------------------
// Screen helpers
// ---------------------------------------------------------------------------
function showScreen(screen) {
  [signinScreen, loadingScreen, mainScreen].forEach((s) => {
    s.hidden = s !== screen;
  });
}

function showError(msg) {
  signinError.textContent = msg;
  signinError.hidden = false;
}

function clearError() {
  signinError.textContent = "";
  signinError.hidden = true;
}

// ---------------------------------------------------------------------------
// Chat list
// ---------------------------------------------------------------------------
function getChatDisplayName(chat) {
  // 1-on-1 chats use the topic or member names
  if (chat.topic) return chat.topic;
  if (chat.chatType === "oneOnOne" && chat.members) {
    const others = chat.members.filter(
      (m) => m.userId !== currentUser?.id
    );
    if (others.length > 0) {
      return others.map((m) => m.displayName).join(", ");
    }
  }
  return chat.id.substring(0, 20) + "…";
}

function renderChatList(chats, unreadIds) {
  chatList.replaceChildren();
  if (!chats || chats.length === 0) {
    const p = document.createElement("p");
    p.className = "placeholder-text";
    p.textContent = "No chats found.";
    chatList.appendChild(p);
    return;
  }

  for (const chat of chats) {
    const name = getChatDisplayName(chat);
    const isUnread = unreadIds.includes(chat.id);
    const isActive = chat.id === currentChatId;

    const item = document.createElement("div");
    item.className =
      "chat-item" +
      (isUnread ? " unread" : "") +
      (isActive ? " active" : "");
    item.dataset.chatId = chat.id;

    // Avatar / initials
    item.appendChild(createAvatarElement(name, null));

    // Text block
    const textBlock = document.createElement("div");
    textBlock.className = "chat-item-text";

    const nameEl = document.createElement("span");
    nameEl.className = "chat-item-name";
    nameEl.textContent = name;
    textBlock.appendChild(nameEl);

    if (chat.lastMessagePreview?.body?.content) {
      const preview = document.createElement("span");
      preview.className = "chat-item-preview";
      preview.textContent = stripHtml(
        chat.lastMessagePreview.body.content
      ).substring(0, 60);
      textBlock.appendChild(preview);
    }

    item.appendChild(textBlock);

    if (isUnread) {
      const dot = document.createElement("span");
      dot.className = "unread-dot";
      item.appendChild(dot);
    }

    item.addEventListener("click", () => selectChat(chat.id, name));
    chatList.appendChild(item);
  }
}

function stripHtml(html) {
  // Use DOMParser so we never touch innerHTML of a rendered element
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

// ---------------------------------------------------------------------------
// Select & load a chat
// ---------------------------------------------------------------------------
async function selectChat(chatId, displayName) {
  if (currentChatId === chatId) return;
  currentChatId = chatId;
  chatTitle.textContent = displayName;
  composeInput.disabled = false;
  sendBtn.disabled = false;

  // Stop any running per-chat timer before starting a new one
  if (messagePollingTimer !== null) {
    clearInterval(messagePollingTimer);
    messagePollingTimer = null;
  }

  // Update active state in list
  document.querySelectorAll(".chat-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.chatId === chatId);
  });

  // Clear container and show a loading spinner
  messagesContainer.replaceChildren();
  const spinner = document.createElement("div");
  spinner.className = "spinner small";
  messagesContainer.appendChild(spinner);

  await loadMessages(chatId);
  // Mark as read
  messenger.runtime.sendMessage({ action: "markAsRead", chatId }).catch(() => {});
  // Remove bold
  unreadSet.delete(chatId);
  renderChatList(currentChats, [...unreadSet]);

  // Start per-chat polling (only if we are still on this chat after await)
  if (currentChatId === chatId && messagePollingTimer === null) {
    messagePollingTimer = setInterval(() => loadMessages(chatId), 15_000);
  }
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------
async function loadMessages(chatId) {
  const resp = await messenger.runtime.sendMessage({
    action: "getMessages",
    chatId,
  });

  if (resp?.error) {
    messagesContainer.replaceChildren();
    const errEl = document.createElement("p");
    errEl.className = "error-text";
    errEl.textContent = resp.error;
    messagesContainer.appendChild(errEl);
    return;
  }

  renderMessages(resp.messages || []);
}

function renderMessages(messages) {
  messagesContainer.replaceChildren();

  const filtered = messages.filter(
    (m) => m.messageType === "message" && m.body?.content
  );

  if (filtered.length === 0) {
    const p = document.createElement("p");
    p.className = "placeholder-text";
    p.textContent = "No messages yet.";
    messagesContainer.appendChild(p);
    return;
  }

  for (const msg of filtered) {
    messagesContainer.appendChild(buildMessageEl(msg));
  }

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function buildMessageEl(msg) {
  const senderName =
    msg.from?.user?.displayName || msg.from?.application?.displayName || "Unknown";
  const isMe = msg.from?.user?.id === currentUser?.id;
  const body = stripHtml(msg.body?.content || "");
  const time = formatTime(msg.createdDateTime);

  const wrapper = document.createElement("div");
  wrapper.className = "message" + (isMe ? " message-mine" : " message-theirs");

  // Avatar
  wrapper.appendChild(createAvatarElement(senderName, null));

  // Bubble
  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const nameEl = document.createElement("span");
  nameEl.className = "sender-name";
  nameEl.textContent = senderName;
  const timeEl = document.createElement("span");
  timeEl.className = "message-time";
  timeEl.textContent = time;
  meta.appendChild(nameEl);
  meta.appendChild(timeEl);

  const bodyEl = document.createElement("div");
  bodyEl.className = "message-body";
  bodyEl.textContent = body;

  bubble.appendChild(meta);
  bubble.appendChild(bodyEl);
  wrapper.appendChild(bubble);

  return wrapper;
}

function formatTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Send message
// ---------------------------------------------------------------------------
async function sendMessage() {
  const content = composeInput.value.trim();
  if (!content || !currentChatId) return;

  composeInput.value = "";
  composeInput.disabled = true;
  sendBtn.disabled = true;

  const resp = await messenger.runtime.sendMessage({
    action: "sendMessage",
    chatId: currentChatId,
    content,
  });

  composeInput.disabled = false;
  sendBtn.disabled = false;
  composeInput.focus();

  if (resp?.error) {
    showTempNotice("Failed to send: " + resp.error);
    return;
  }

  // Reload messages to show the sent one
  await loadMessages(currentChatId);
}

function showTempNotice(text) {
  const el = document.createElement("div");
  el.className = "temp-notice";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------------------------------------------------------------------------
// Background push updates
// ---------------------------------------------------------------------------
messenger.runtime.onMessage.addListener((message) => {
  if (message.action === "chatsUpdated") {
    currentChats = message.chats || [];
    unreadSet = new Set(message.unreadChatIds || []);
    renderChatList(currentChats, message.unreadChatIds || []);
  }
  if (message.action === "signedOut") {
    clearInterval(messagePollingTimer);
    currentChatId = null;
    showScreen(signinScreen);
  }
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function bootstrap() {
  showScreen(loadingScreen);

  // Load settings (avatars flag, etc.)
  const stored = await messenger.storage.local.get([
    "disableAvatars",
    "currentUser",
  ]);
  disableAvatars = stored.disableAvatars === true;
  currentUser = stored.currentUser || null;

  const status = await messenger.runtime.sendMessage({ action: "getStatus" });

  if (!status?.authenticated) {
    showScreen(signinScreen);
    return;
  }

  showScreen(mainScreen);

  // Load chats
  const resp = await messenger.runtime.sendMessage({ action: "getChats" });
  if (resp?.error) {
    showScreen(signinScreen);
    showError(resp.error);
    return;
  }

  currentChats = resp.chats || [];
  unreadSet = new Set(resp.unreadChatIds || []);
  renderChatList(currentChats, resp.unreadChatIds || []);
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
signinBtn.addEventListener("click", async () => {
  clearError();
  signinBtn.disabled = true;
  signinBtn.textContent = "Signing in…";
  const resp = await messenger.runtime.sendMessage({ action: "authenticate" });
  signinBtn.disabled = false;
  signinBtn.textContent = "Sign in with Microsoft";
  if (resp?.success) {
    await bootstrap();
  } else {
    showError(resp?.error || "Authentication failed.");
  }
});

openOptionsLink.addEventListener("click", (e) => {
  e.preventDefault();
  messenger.runtime.openOptionsPage();
});

signoutBtn.addEventListener("click", async () => {
  clearInterval(messagePollingTimer);
  await messenger.runtime.sendMessage({ action: "signOut" });
  currentChatId = null;
  showScreen(signinScreen);
});

refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  const resp = await messenger.runtime.sendMessage({ action: "getChats" });
  if (!resp?.error) {
    currentChats = resp.chats || [];
    unreadSet = new Set(resp.unreadChatIds || []);
    renderChatList(currentChats, resp.unreadChatIds || []);
  }
  refreshBtn.disabled = false;
});

composeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

// Run
bootstrap().catch(console.error);

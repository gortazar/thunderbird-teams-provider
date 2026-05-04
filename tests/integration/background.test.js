"use strict";

/**
 * Integration tests for background/background.js.
 *
 * @jest-environment node
 *
 * background.js uses global `messenger`, `fetch`, `crypto`, and `URL`.
 * All are set up before the module is required. Each test group calls
 * jest.resetModules() + re-requires the file to get fresh isolated module state.
 */

const path = require("path");
const { createMessengerMock } = require("../helpers/messengerMock");

const BACKGROUND = path.resolve(
  __dirname,
  "../../background/background.js"
);

let messageHandler;
let mockMessenger;

function loadBackground() {
  jest.resetModules();
  messageHandler = null;

  // Build a fresh mock and capture the onMessage listener
  mockMessenger = createMessengerMock();
  mockMessenger.runtime.onMessage.addListener.mockImplementation((fn) => {
    messageHandler = fn;
  });

  global.messenger = mockMessenger;

  // Ensure fetch exists as a configurable global
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  });

  require(BACKGROUND);
}

/**
 * Mocks global.fetch so calls matching a URL fragment return the given body.
 * @param {Record<string, object>} responses  key fragment → response body
 */
function mockGraphApi(responses) {
  global.fetch = jest.fn().mockImplementation((url) => {
    for (const [fragment, body] of Object.entries(responses)) {
      if (url.includes(fragment)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(body),
        });
      }
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { message: "not_mocked" } }),
    });
  });
}

beforeEach(() => {
  loadBackground();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete global.messenger;
  delete global.fetch;
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------
describe("getStatus", () => {
  test("returns authenticated:false when no token is set", async () => {
    const result = await messageHandler({ action: "getStatus" });
    expect(result.authenticated).toBe(false);
    expect(result.chats).toEqual([]);
    expect(Array.isArray(result.unreadChatIds)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// signOut
// ---------------------------------------------------------------------------
describe("signOut", () => {
  test("clears storage and returns success", async () => {
    const result = await messageHandler({ action: "signOut" });
    expect(result).toEqual({ success: true });
    expect(mockMessenger.storage.local.remove).toHaveBeenCalledWith(
      expect.arrayContaining(["accessToken", "refreshToken", "tokenExpiry"])
    );
  });

  test("sends signedOut push notification to popup", async () => {
    await messageHandler({ action: "signOut" });
    expect(mockMessenger.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "signedOut" })
    );
  });
});

// ---------------------------------------------------------------------------
// getChats — unauthenticated
// ---------------------------------------------------------------------------
describe("getChats (unauthenticated)", () => {
  test("returns an error when no access token is present", async () => {
    const result = await messageHandler({ action: "getChats" });
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// getMessages — unauthenticated
// ---------------------------------------------------------------------------
describe("getMessages (unauthenticated)", () => {
  test("returns an error when no access token is present", async () => {
    const result = await messageHandler({ action: "getMessages", chatId: "chat-001" });
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// sendMessage — unauthenticated
// ---------------------------------------------------------------------------
describe("sendMessage (unauthenticated)", () => {
  test("returns an error when no access token is present", async () => {
    const result = await messageHandler({
      action: "sendMessage",
      chatId: "chat-001",
      content: "Hello",
    });
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// markAsRead
// ---------------------------------------------------------------------------
describe("markAsRead", () => {
  test("writes to lastReadTimes storage and returns success", async () => {
    mockMessenger.storage.local.get.mockResolvedValue({ lastReadTimes: {} });

    const result = await messageHandler({ action: "markAsRead", chatId: "chat-001" });
    expect(result).toEqual({ success: true });
    expect(mockMessenger.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastReadTimes: expect.objectContaining({ "chat-001": expect.any(String) }),
      })
    );
  });

  test("preserves existing lastReadTimes entries", async () => {
    const existing = { "chat-existing": "2024-01-01T00:00:00.000Z" };
    mockMessenger.storage.local.get.mockResolvedValue({ lastReadTimes: existing });

    await messageHandler({ action: "markAsRead", chatId: "chat-new" });

    const [[setArg]] = mockMessenger.storage.local.set.mock.calls;
    expect(setArg.lastReadTimes["chat-existing"]).toBe("2024-01-01T00:00:00.000Z");
    expect(setArg.lastReadTimes["chat-new"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// settingsUpdated
// ---------------------------------------------------------------------------
describe("settingsUpdated", () => {
  test("reloads settings from storage and returns success", async () => {
    mockMessenger.storage.local.get.mockResolvedValue({
      clientId: "new-client-id",
      disableAvatars: true,
    });

    const result = await messageHandler({ action: "settingsUpdated" });
    expect(result).toEqual({ success: true });
    expect(mockMessenger.storage.local.get).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getChats — authenticated via injected token state
// ---------------------------------------------------------------------------
describe("getChats (authenticated)", () => {
  /**
   * Inject tokens into background module state by loading background.js with
   * a mock that provides a stored accessToken so startPolling() fires.
   */
  function loadAuthenticatedBackground(chatList) {
    jest.resetModules();
    messageHandler = null;

    mockMessenger = createMessengerMock();
    mockMessenger.runtime.onMessage.addListener.mockImplementation((fn) => {
      messageHandler = fn;
    });
    // Pre-populate storage with a token so init() sets accessToken
    mockMessenger.storage.local.get.mockImplementation((keys) => {
      const all = {
        accessToken: "test_token",
        refreshToken: "test_refresh",
        tokenExpiry: Date.now() + 3600_000, // valid for 1 h
        currentUser: { id: "user-me-001" },
      };
      if (Array.isArray(keys)) {
        return Promise.resolve(
          Object.fromEntries(keys.map((k) => [k, all[k]]))
        );
      }
      return Promise.resolve(all);
    });

    global.messenger = mockMessenger;
    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes("/me/chats")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ value: chatList }),
        });
      }
      if (url.includes("/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: "user-me-001" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    });

    require(BACKGROUND);
  }

  test("returns chat list from Graph API", async () => {
    const chats = [
      { id: "chat-001", chatType: "oneOnOne", topic: "Test Chat", members: [] },
    ];
    loadAuthenticatedBackground(chats);

    // Wait for async init() to complete
    await new Promise((r) => setTimeout(r, 50));

    mockGraphApi({
      "/me/chats": { value: chats },
    });

    const result = await messageHandler({ action: "getChats" });
    expect(result.chats).toBeDefined();
    expect(Array.isArray(result.chats)).toBe(true);
  });

  test("returns unreadChatIds as an array", async () => {
    loadAuthenticatedBackground([]);
    await new Promise((r) => setTimeout(r, 50));

    mockGraphApi({ "/me/chats": { value: [] } });

    const result = await messageHandler({ action: "getChats" });
    expect(Array.isArray(result.unreadChatIds)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getMessages — authenticated
// ---------------------------------------------------------------------------
describe("getMessages (authenticated)", () => {
  beforeEach(() => {
    jest.resetModules();
    messageHandler = null;

    mockMessenger = createMessengerMock();
    mockMessenger.runtime.onMessage.addListener.mockImplementation((fn) => {
      messageHandler = fn;
    });
    mockMessenger.storage.local.get.mockImplementation((keys) => {
      const all = {
        accessToken: "test_token",
        refreshToken: "test_refresh",
        tokenExpiry: Date.now() + 3600_000,
        currentUser: { id: "user-me-001" },
      };
      if (Array.isArray(keys)) {
        return Promise.resolve(Object.fromEntries(keys.map((k) => [k, all[k]])));
      }
      return Promise.resolve(all);
    });

    global.messenger = mockMessenger;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ value: [] }),
    });

    require(BACKGROUND);
  });

  test("returns messages in chronological order (oldest first)", async () => {
    // Graph API returns messages newest-first; background.js reverses them.
    const rawMessagesNewestFirst = [
      { id: "m3", messageType: "message", createdDateTime: "2024-01-15T12:00:00Z" },
      { id: "m2", messageType: "message", createdDateTime: "2024-01-15T11:00:00Z" },
      { id: "m1", messageType: "message", createdDateTime: "2024-01-15T10:00:00Z" },
    ];

    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes("/chats/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ value: rawMessagesNewestFirst }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: [] }),
      });
    });

    await new Promise((r) => setTimeout(r, 50));

    const result = await messageHandler({ action: "getMessages", chatId: "chat-001" });
    expect(result.messages).toHaveLength(3);
    // Messages are reversed in background.js so oldest comes first
    expect(result.messages[0].id).toBe("m1");
    expect(result.messages[2].id).toBe("m3");
  });

  test("returns empty array when Graph API returns no messages", async () => {
    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes("/chats/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ value: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: [] }),
      });
    });

    await new Promise((r) => setTimeout(r, 50));

    const result = await messageHandler({ action: "getMessages", chatId: "chat-001" });
    expect(result.messages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sendMessage — authenticated
// ---------------------------------------------------------------------------
describe("sendMessage (authenticated)", () => {
  beforeEach(() => {
    jest.resetModules();
    messageHandler = null;

    mockMessenger = createMessengerMock();
    mockMessenger.runtime.onMessage.addListener.mockImplementation((fn) => {
      messageHandler = fn;
    });
    mockMessenger.storage.local.get.mockResolvedValue({
      accessToken: "test_token",
      refreshToken: "test_refresh",
      tokenExpiry: Date.now() + 3600_000,
      currentUser: { id: "user-me-001" },
    });

    global.messenger = mockMessenger;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "new-msg-id" }),
    });

    require(BACKGROUND);
  });

  test("calls Graph API and returns success", async () => {
    await new Promise((r) => setTimeout(r, 50));

    const result = await messageHandler({
      action: "sendMessage",
      chatId: "chat-001",
      content: "Hello world",
    });

    expect(result.success).toBe(true);
    // Verify fetch was called with a POST to the messages endpoint
    const postCall = global.fetch.mock.calls.find(
      ([url, opts]) => url.includes("/messages") && opts?.method === "POST"
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall[1].body);
    expect(body.body.content).toBe("Hello world");
  });

  test("includes chat ID in the request URL", async () => {
    await new Promise((r) => setTimeout(r, 50));

    await messageHandler({
      action: "sendMessage",
      chatId: "chat-special-id",
      content: "test",
    });

    const postCall = global.fetch.mock.calls.find(
      ([, opts]) => opts?.method === "POST"
    );
    expect(postCall[0]).toContain("chat-special-id");
  });
});

// ---------------------------------------------------------------------------
// authenticate — security: state mismatch protection
// ---------------------------------------------------------------------------
describe("authenticate — CSRF (state mismatch)", () => {
  test("throws when returned state does not match sent state", async () => {
    jest.resetModules();
    messageHandler = null;

    mockMessenger = createMessengerMock();
    mockMessenger.runtime.onMessage.addListener.mockImplementation((fn) => {
      messageHandler = fn;
    });
    // Provide a real clientId so the placeholder check is bypassed and the
    // PKCE auth flow reaches the state-comparison guard.
    mockMessenger.storage.local.get.mockResolvedValue({
      clientId: "real-client-id-for-test",
    });
    // Simulate Microsoft returning a different state parameter (CSRF attempt)
    mockMessenger.identity.launchWebAuthFlow.mockResolvedValue(
      "https://example.com/redirect?code=auth_code&state=TAMPERED_STATE"
    );

    global.messenger = mockMessenger;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    require(BACKGROUND);
    await new Promise((r) => setTimeout(r, 20));

    const result = await messageHandler({ action: "authenticate" });
    // Should fail gracefully (not throw uncaught)
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/[Ss]tate/);
  });
});

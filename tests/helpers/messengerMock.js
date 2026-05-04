"use strict";

/**
 * Creates a mock for the `messenger` global used by background.js and
 * popup/teams.js. Captures registered listeners so tests can invoke them
 * directly.
 */
function createMessengerMock() {
  const listeners = {
    onInstalled: [],
    onStartup: [],
    onMessage: [],
    onStorageChanged: [],
  };

  const mock = {
    runtime: {
      onInstalled: {
        addListener: jest.fn((fn) => listeners.onInstalled.push(fn)),
      },
      onStartup: {
        addListener: jest.fn((fn) => listeners.onStartup.push(fn)),
      },
      onMessage: {
        addListener: jest.fn((fn) => listeners.onMessage.push(fn)),
      },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      openOptionsPage: jest.fn(),
      getURL: jest.fn((path) => `moz-extension://test-id/${path}`),
    },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue({}),
        remove: jest.fn().mockResolvedValue({}),
      },
      onChanged: {
        addListener: jest.fn((fn) => listeners.onStorageChanged.push(fn)),
      },
    },
    identity: {
      getRedirectURL: jest.fn().mockReturnValue("https://example.com/redirect"),
      launchWebAuthFlow: jest.fn().mockResolvedValue(
        "https://example.com/redirect?code=auth_code&state=test_state"
      ),
    },
    spacesToolbar: {
      addButton: jest.fn().mockResolvedValue("space-btn-1"),
      setIcons: jest.fn().mockResolvedValue(undefined),
    },

    // Expose captured listeners for test use
    _listeners: listeners,
  };

  return mock;
}

module.exports = { createMessengerMock };

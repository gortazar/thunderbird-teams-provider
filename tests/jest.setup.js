"use strict";

const nodeCrypto = require("crypto");
const { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder } = require("util");

// Polyfill TextEncoder / TextDecoder for Jest's node test environment.
if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = NodeTextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = NodeTextDecoder;
}

// Polyfill Web Crypto API for Jest's node test environment.
// background.js uses crypto.getRandomValues and crypto.subtle.digest (PKCE).
// In Node 18+, require('crypto').webcrypto is the full Web Crypto implementation.
// global.crypto may be a getter, so use Object.defineProperty to overwrite it.
if (!global.crypto || !global.crypto.subtle) {
  Object.defineProperty(global, "crypto", {
    value: nodeCrypto.webcrypto,
    writable: true,
    configurable: true,
  });
}

// Silence console output during tests unless DEBUG_TESTS is set
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  };
}

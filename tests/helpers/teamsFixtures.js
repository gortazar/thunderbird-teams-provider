"use strict";

const FIXTURES = {
  currentUser: {
    id: "user-me-001",
    displayName: "Test User",
    userPrincipalName: "testuser@example.com",
  },

  chats: [
    {
      id: "chat-001",
      chatType: "oneOnOne",
      topic: null,
      members: [
        { userId: "user-me-001", displayName: "Test User" },
        { userId: "user-other-002", displayName: "Alice Smith" },
      ],
      lastMessagePreview: {
        createdDateTime: "2024-01-15T10:00:00Z",
        body: { content: "Hello there" },
        from: { user: { id: "user-other-002" } },
      },
    },
    {
      id: "chat-002",
      chatType: "group",
      topic: "Project Team",
      members: [
        { userId: "user-me-001", displayName: "Test User" },
        { userId: "user-other-003", displayName: "Bob Jones" },
      ],
      lastMessagePreview: {
        createdDateTime: "2024-01-15T09:00:00Z",
        body: { content: "Meeting at 2pm" },
        from: { user: { id: "user-me-001" } },
      },
    },
  ],

  messages: [
    {
      id: "msg-001",
      messageType: "message",
      createdDateTime: "2024-01-15T09:55:00Z",
      from: { user: { id: "user-other-002", displayName: "Alice Smith" } },
      body: { content: "Hello there", contentType: "text" },
    },
    {
      id: "msg-002",
      messageType: "message",
      createdDateTime: "2024-01-15T10:00:00Z",
      from: { user: { id: "user-me-001", displayName: "Test User" } },
      body: { content: "Hi Alice!", contentType: "text" },
    },
    {
      id: "msg-003",
      messageType: "systemEventMessage",
      createdDateTime: "2024-01-15T08:00:00Z",
      from: null,
      body: { content: "<p>User joined</p>", contentType: "html" },
    },
  ],

  graphApiResponses: {
    chats: {
      value: [],
    },
    messages: {
      value: [],
    },
    me: {
      id: "user-me-001",
      displayName: "Test User",
    },
    tokenResponse: {
      access_token: "access_token_abc123",
      refresh_token: "refresh_token_xyz789",
      expires_in: 3600,
    },
  },
};

module.exports = FIXTURES;

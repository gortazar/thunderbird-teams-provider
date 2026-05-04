"use strict";

/**
 * Unit tests for getChatDisplayName() — copied from popup/teams.js.
 */

function getChatDisplayName(chat, currentUser) {
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

describe("getChatDisplayName", () => {
  const ME = { id: "user-me" };

  test("returns topic when present", () => {
    const chat = { id: "c1", topic: "Project Discussion", chatType: "group", members: [] };
    expect(getChatDisplayName(chat, ME)).toBe("Project Discussion");
  });

  test("one-on-one: returns name of the other participant", () => {
    const chat = {
      id: "c2",
      chatType: "oneOnOne",
      topic: null,
      members: [
        { userId: "user-me", displayName: "Me" },
        { userId: "user-alice", displayName: "Alice Smith" },
      ],
    };
    expect(getChatDisplayName(chat, ME)).toBe("Alice Smith");
  });

  test("one-on-one: excludes current user from display name", () => {
    const chat = {
      id: "c3",
      chatType: "oneOnOne",
      topic: null,
      members: [
        { userId: "user-me", displayName: "Me" },
        { userId: "user-bob", displayName: "Bob Jones" },
      ],
    };
    expect(getChatDisplayName(chat, ME)).toBe("Bob Jones");
  });

  test("group chat without topic falls back to truncated ID", () => {
    const chat = {
      id: "chat-id-very-long-string-here",
      chatType: "group",
      topic: null,
      members: [],
    };
    const result = getChatDisplayName(chat, ME);
    expect(result).toBe("chat-id-very-long-st…");
  });

  test("one-on-one with no other members falls back to truncated ID", () => {
    const chat = {
      id: "c4-short",
      chatType: "oneOnOne",
      topic: null,
      members: [{ userId: "user-me", displayName: "Me" }],
    };
    expect(getChatDisplayName(chat, ME)).toBe("c4-short…");
  });

  test("null currentUser: includes all members in one-on-one", () => {
    const chat = {
      id: "c5",
      chatType: "oneOnOne",
      topic: null,
      members: [
        { userId: "user-alice", displayName: "Alice" },
        { userId: "user-bob", displayName: "Bob" },
      ],
    };
    const result = getChatDisplayName(chat, null);
    expect(result).toBe("Alice, Bob");
  });

  test("no members array: falls back to truncated ID", () => {
    const chat = { id: "c6-no-members", chatType: "oneOnOne", topic: null };
    expect(getChatDisplayName(chat, ME)).toBe("c6-no-members…");
  });
});

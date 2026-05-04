"use strict";

/**
 * Unit tests for getAvatarColor() — copied from popup/teams.js for isolated testing.
 * Tests that color assignment is deterministic and never out-of-bounds.
 */

const AVATAR_COLORS = [
  "#2266D1", "#9C27B0", "#E53935", "#00897B",
  "#43A047", "#FB8C00", "#8E24AA", "#039BE5",
  "#6D4C41", "#546E7A", "#00ACC1", "#7CB342",
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

describe("getAvatarColor", () => {
  test("returns a colour from the AVATAR_COLORS palette", () => {
    const color = getAvatarColor("Alice Smith");
    expect(AVATAR_COLORS).toContain(color);
  });

  test("same name always returns the same colour (deterministic)", () => {
    const name = "Jane Doe";
    expect(getAvatarColor(name)).toBe(getAvatarColor(name));
  });

  test("different names can return different colours", () => {
    const colors = new Set(
      ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry",
       "Irene", "Jack", "Karen", "Liam"].map(getAvatarColor)
    );
    // With 12 names and 12 palette entries we expect multiple distinct colours
    expect(colors.size).toBeGreaterThan(1);
  });

  test("empty string does not throw and returns a palette colour", () => {
    const color = getAvatarColor("");
    expect(AVATAR_COLORS).toContain(color);
  });

  test("null does not throw and returns a palette colour", () => {
    const color = getAvatarColor(null);
    expect(AVATAR_COLORS).toContain(color);
  });

  test("always returns a valid CSS hex colour string", () => {
    ["A", "AB CD", "John Middle Smith", "あいう"].forEach((name) => {
      expect(getAvatarColor(name)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

"use strict";

/**
 * Unit tests for getInitials() — copied from popup/teams.js for isolated testing.
 */

function getInitials(displayName) {
  if (!displayName) return "?";
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return displayName.substring(0, 2).toUpperCase();
}

describe("getInitials", () => {
  test("two-word name returns first+last initials uppercased", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  test("single word returns first two characters uppercased", () => {
    expect(getInitials("Alice")).toBe("AL");
  });

  test("three-word name uses first and last word initials", () => {
    expect(getInitials("Jane Middle Smith")).toBe("JS");
  });

  test("empty string returns '?'", () => {
    expect(getInitials("")).toBe("?");
  });

  test("null returns '?'", () => {
    expect(getInitials(null)).toBe("?");
  });

  test("undefined returns '?'", () => {
    expect(getInitials(undefined)).toBe("?");
  });

  test("lowercase two-word name returns uppercased initials", () => {
    expect(getInitials("alice bob")).toBe("AB");
  });

  test("extra whitespace between words is handled", () => {
    expect(getInitials("  Jane   Smith  ")).toBe("JS");
  });

  test("single character name returns that character uppercased (padded to 2)", () => {
    expect(getInitials("A")).toBe("A");
  });
});

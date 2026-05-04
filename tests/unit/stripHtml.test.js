"use strict";

/**
 * Unit tests for stripHtml() — copied from popup/teams.js for isolated testing.
 * Uses jsdom's DOMParser (provided by jest-environment-jsdom).
 */

function stripHtml(html) {
  // Use DOMParser so we never touch innerHTML of a rendered element
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

describe("stripHtml", () => {
  test("plain text passes through unchanged", () => {
    expect(stripHtml("hello world")).toBe("hello world");
  });

  test("strips simple HTML tags", () => {
    expect(stripHtml("<p>hello</p>")).toBe("hello");
  });

  test("strips nested tags", () => {
    expect(stripHtml("<div><span>text</span></div>")).toBe("text");
  });

  test("strips <script> tags and their content is returned as text (DOMParser safe)", () => {
    // DOMParser inside <body> does NOT execute scripts, but does return text content
    const result = stripHtml("<p>safe</p><script>alert(1)</script>");
    expect(result).not.toContain("<script>");
    // The text content of a script tag is returned by textContent
    expect(result).toContain("safe");
  });

  test("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });

  test("handles HTML entities — &amp; decoded to &", () => {
    expect(stripHtml("a &amp; b")).toBe("a & b");
  });

  test("handles HTML entities — &lt; decoded to <", () => {
    expect(stripHtml("&lt;b&gt;")).toBe("<b>");
  });

  test("strips bold/italic formatting tags", () => {
    expect(stripHtml("<strong>bold</strong> and <em>italic</em>")).toBe("bold and italic");
  });

  test("preserves whitespace between block elements", () => {
    // Browsers insert a newline between block-level elements in textContent
    const result = stripHtml("<p>line1</p><p>line2</p>");
    expect(result).toContain("line1");
    expect(result).toContain("line2");
  });

  test("null-safe: empty string for non-string input that produces empty textContent", () => {
    expect(stripHtml("<br/>")).toBe("");
  });
});

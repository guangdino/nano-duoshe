import { describe, expect, it } from "vitest";
import { isNewer } from "./check.js";

describe("isNewer", () => {
  it("detects patch bumps", () => {
    expect(isNewer("0.1.0", "0.1.1")).toBe(true);
    expect(isNewer("0.1.1", "0.1.0")).toBe(false);
  });

  it("detects minor and major bumps", () => {
    expect(isNewer("0.1.9", "0.2.0")).toBe(true);
    expect(isNewer("0.9.9", "1.0.0")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(false);
  });

  it("treats equal versions as not newer", () => {
    expect(isNewer("1.2.3", "1.2.3")).toBe(false);
  });

  it("ranks stable above prerelease at the same x.y.z", () => {
    expect(isNewer("0.1.0-alpha.0", "0.1.0")).toBe(true);
    expect(isNewer("0.1.0", "0.1.0-alpha.0")).toBe(false);
  });

  it("compares prerelease tags lexicographically when both are pre", () => {
    expect(isNewer("0.1.0-alpha.0", "0.1.0-beta.0")).toBe(true);
    expect(isNewer("0.1.0-beta.0", "0.1.0-alpha.0")).toBe(false);
  });

  it("handles malformed segments without throwing", () => {
    expect(isNewer("", "0.0.1")).toBe(true);
    expect(isNewer("0.0.0", "")).toBe(false);
  });
});

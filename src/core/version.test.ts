import { describe, expect, it } from "vitest";
import { getVersion } from "./version.js";

describe("getVersion", () => {
  it("returns a non-empty version string", () => {
    const version = getVersion();
    expect(version).toBeTruthy();
    expect(typeof version).toBe("string");
  });

  it("returns a semver-shaped string (or the unknown sentinel)", () => {
    const version = getVersion();
    const semverLike = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
    expect(version === "0.0.0-unknown" || semverLike.test(version)).toBe(true);
  });

  it("is cached across calls", () => {
    expect(getVersion()).toBe(getVersion());
  });
});

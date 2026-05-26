import { describe, expect, it } from "vitest";
import { bigramize, hasCjk } from "./tokenize.js";

describe("hasCjk", () => {
  it("true for any CJK char", () => {
    expect(hasCjk("中")).toBe(true);
    expect(hasCjk("hello 中文")).toBe(true);
  });
  it("false for pure ASCII", () => {
    expect(hasCjk("hello world 123")).toBe(false);
    expect(hasCjk("")).toBe(false);
  });
});

describe("bigramize", () => {
  it("returns input unchanged when no CJK", () => {
    expect(bigramize("hello world")).toBe("hello world");
    expect(bigramize("")).toBe("");
  });

  it("splits CJK runs into 2-grams joined by space", () => {
    expect(bigramize("中文测试")).toBe("中文 文测 测试");
  });

  it("keeps single CJK char as itself", () => {
    expect(bigramize("好")).toBe("好");
  });

  it("preserves non-CJK around CJK runs", () => {
    expect(bigramize("DuoShe 中文测试 v1.0")).toBe("DuoShe 中文 文测 测试 v1.0");
  });

  it("handles mixed runs with digits and CJK (digits break CJK runs)", () => {
    // "用" is a single CJK char run -> "用"
    // "12" is ASCII -> stays "12"
    // "个月" is CJK run of 2 -> "个月"
    // "不转方向" is CJK run of 4 -> "不转 转方 方向"
    expect(bigramize("用 12个月 不转方向")).toBe("用 12个月 不转 转方 方向");
  });
});

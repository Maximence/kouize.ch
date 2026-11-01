import { describe, expect, it } from "vitest";
import {
  allocateQuestions,
  buildBatches,
  evenSplit,
  planMix,
  splitContent,
  type ChunkableSection,
} from "@/lib/markdown/chunk";

const sec = (id: string, len: number): ChunkableSection => ({
  id,
  headingPath: id,
  content: "x".repeat(len),
  charLen: len,
});

const sum = (xs: { count: number }[]) => xs.reduce((a, b) => a + b.count, 0);

describe("allocateQuestions", () => {
  it("is proportional to length and sums to the total", () => {
    const a = allocateQuestions([sec("a", 3000), sec("b", 1000), sec("c", 1000)], 10);
    expect(sum(a)).toBe(10);
    expect(a.find((x) => x.sectionId === "a")!.count).toBe(6);
    expect(a.find((x) => x.sectionId === "b")!.count).toBe(2);
  });

  it("skips tiny sections unless explicitly selected", () => {
    const s = [sec("big", 5000), sec("tiny", 50)];
    expect(allocateQuestions(s, 5).map((x) => x.sectionId)).toEqual(["big"]);
    const explicit = allocateQuestions([sec("tiny", 50), sec("t2", 60)], 2, { explicit: true });
    expect(sum(explicit)).toBe(2);
  });

  it("caps short sections and redistributes the rest", () => {
    // 'short' can hold at most 2 (500/250), 'long' takes the remainder
    const a = allocateQuestions([sec("short", 500), sec("long", 600_000)], 20);
    expect(a.find((x) => x.sectionId === "short")?.count ?? 0).toBeLessThanOrEqual(2);
    expect(sum(a)).toBe(20);
  });

  it("returns fewer than requested when content is too small", () => {
    expect(sum(allocateQuestions([sec("a", 500)], 10))).toBe(2);
  });

  it("falls back to tiny sections if nothing is long enough", () => {
    expect(sum(allocateQuestions([sec("a", 100)], 3))).toBe(1);
  });

  it("handles empty input", () => {
    expect(allocateQuestions([], 5)).toEqual([]);
    expect(allocateQuestions([sec("a", 1000)], 0)).toEqual([]);
  });
});

describe("splitContent", () => {
  it("splits long content at blank lines but never inside code fences", () => {
    const para = "word ".repeat(100).trim();
    const code = "```\n" + "line\n\n".repeat(80) + "```";
    const content = [para, para, code, para, para].join("\n\n");
    const pieces = splitContent(content, 1200);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) {
      const fences = (p.match(/```/g) ?? []).length;
      expect(fences % 2).toBe(0);
    }
    expect(pieces.join(" ").replace(/\s+/g, "")).toBe(content.replace(/\s+/g, ""));
  });
});

describe("buildBatches", () => {
  it("packs sections into batches within limits, in document order", () => {
    const sections = [sec("a", 8000), sec("b", 8000), sec("c", 8000)];
    const batches = buildBatches(sections, [
      { sectionId: "a", count: 4 },
      { sectionId: "b", count: 4 },
      { sectionId: "c", count: 4 },
    ], { maxChars: 20_000, maxQuestions: 12 });
    expect(batches).toHaveLength(2);
    expect(batches[0].parts.map((p) => p.sectionId)).toEqual(["a", "b"]);
    expect(batches.reduce((a, b) => a + b.total, 0)).toBe(12);
  });

  it("splits a huge allocation across batches", () => {
    const batches = buildBatches([sec("a", 3000)], [{ sectionId: "a", count: 30 }], {
      maxChars: 20_000,
      maxQuestions: 12,
    });
    expect(batches.map((b) => b.total)).toEqual([12, 12, 6]);
  });
});

describe("mix planning", () => {
  it("evenSplit distributes remainders to earlier keys", () => {
    expect(evenSplit(5, ["mcq", "tf"])).toEqual({ mcq: 3, tf: 2 });
  });

  it("planMix covers every question exactly once", () => {
    const batches = [{ parts: [], total: 7 }, { parts: [], total: 5 }];
    const mix = planMix(batches, ["mcq", "tf", "short"], "mixed");
    const typeTotal = mix.map((m) => Object.values(m.types).reduce((a, b) => a + b!, 0));
    const diffTotal = mix.map((m) => Object.values(m.difficulties).reduce((a, b) => a + b!, 0));
    expect(typeTotal).toEqual([7, 5]);
    expect(diffTotal).toEqual([7, 5]);
    const allTypes = mix.reduce((acc, m) => {
      for (const [k, v] of Object.entries(m.types)) acc[k] = (acc[k] ?? 0) + v!;
      return acc;
    }, {} as Record<string, number>);
    expect(allTypes).toEqual({ mcq: 4, tf: 4, short: 4 });
  });

  it("single difficulty", () => {
    const mix = planMix([{ parts: [], total: 3 }], ["mcq"], "hard");
    expect(mix[0].difficulties).toEqual({ hard: 3 });
  });
});

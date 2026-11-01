import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMarkdown, sectionBody } from "@/lib/markdown/parse";

describe("parseMarkdown", () => {
  it("splits on H1–H3 and builds heading paths", () => {
    const md = [
      "# Audio",
      "intro",
      "## Sampling",
      "text",
      "### Nyquist",
      "fe > 2 fmax",
      "#### Detail",
      "stays in Nyquist",
      "## Quantization",
      "bits",
    ].join("\n");
    const s = parseMarkdown(md);
    expect(s.map((x) => x.headingPath)).toEqual([
      "Audio",
      "Audio > Sampling",
      "Audio > Sampling > Nyquist",
      "Audio > Quantization",
    ]);
    expect(s[2].content).toContain("#### Detail");
    expect(s[2].content).toContain("stays in Nyquist");
    expect(s.map((x) => x.level)).toEqual([1, 2, 3, 2]);
    expect(s.map((x) => x.ord)).toEqual([0, 1, 2, 3]);
  });

  it("does not treat # inside fenced code as a heading", () => {
    const md = "# Code\n\n```bash\n# not a heading\necho hi\n```\n\nafter";
    const s = parseMarkdown(md);
    expect(s).toHaveLength(1);
    expect(s[0].content).toContain("# not a heading");
  });

  it("keeps a preamble before the first heading and skips front matter", () => {
    const md = "---\ntitle: x\n---\n\nSome intro text.\n\n# First\nbody";
    const s = parseMarkdown(md);
    expect(s[0]).toMatchObject({ level: 0, heading: "Introduction", anchor: "" });
    expect(s[0].content).toBe("Some intro text.");
    expect(s[0].content).not.toContain("title");
    expect(s[1].heading).toBe("First");
  });

  it("drops empty preamble", () => {
    expect(parseMarkdown("# A\ntext")[0].heading).toBe("A");
  });

  it("generates github-style anchors with duplicate suffixes, counting H4+", () => {
    const md = "# Intro\n## Notes\n#### Notes\n## Notes\n## Été & Hiver";
    const s = parseMarkdown(md);
    expect(s.map((x) => x.anchor)).toEqual(["intro", "notes", "notes-2", "été--hiver"]);
  });

  it("resets the path when a shallower heading appears", () => {
    const md = "# A\n### Deep\n## B\n# C\n### D";
    expect(parseMarkdown(md).map((x) => x.headingPath)).toEqual(["A", "A > Deep", "A > B", "C", "C > D"]);
  });

  it("uses the heading text, not the markup, for math and code in headings", () => {
    const s = parseMarkdown("# The `sort()` method and $O(n)$");
    expect(s[0].heading).toBe("The sort() method and O(n)");
  });

  it("charLen matches content length and sectionBody strips the heading", () => {
    const s = parseMarkdown("# Title\n\nBody line\n");
    expect(s[0].charLen).toBe(s[0].content.length);
    expect(sectionBody(s[0])).toBe("Body line");
  });

  it("parses the bundled samples", () => {
    const fr = fs.readFileSync(path.join(__dirname, "../../samples/audio-numerique.md"), "utf8");
    const s = parseMarkdown(fr);
    expect(s[0].level).toBe(0);
    expect(s.map((x) => x.headingPath)).toContain("Échantillonnage > Théorème de Nyquist-Shannon > Repliement spectral");
    const debit = s.find((x) => x.heading === "Calcul du débit")!;
    expect(debit.content).toContain("# débit en bits par seconde");
  });
});

import { describe, expect, it } from "vitest";
import { excerptInSource, isDuplicate, normalizeText, similarity } from "@/lib/markdown/excerpt";
import { detectLanguage } from "@/lib/lang";

const source = `## Théorème de Nyquist-Shannon

Pour reconstruire parfaitement un signal, la fréquence d'échantillonnage doit être **strictement supérieure** au double de la fréquence maximale.

La moitié de la fréquence d'échantillonnage est appelée **fréquence de Nyquist**.

| Usage | Fréquence |
|---|---|
| CD audio | 44,1 kHz |`;

describe("excerptInSource", () => {
  it("matches exact quotes", () => {
    expect(excerptInSource("est appelée fréquence de Nyquist", source)).toBe(true);
  });

  it("ignores markdown emphasis, quote styles and whitespace", () => {
    expect(excerptInSource("doit être strictement   supérieure au double", source)).toBe(true);
    expect(excerptInSource("la fréquence d’échantillonnage doit être", source)).toBe(true);
  });

  it("matches table rows without pipes", () => {
    expect(excerptInSource("CD audio 44,1 kHz", source)).toBe(true);
  });

  it("accepts a lightly edited quote via fuzzy match", () => {
    expect(
      excerptInSource(
        "Pour reconstruire parfaitement un signal, la fréquence d'échantillonnage doit être strictement supérieure au double de la fréquence maximale",
        source.replace("parfaitement ", ""),
      ),
    ).toBe(true);
  });

  it("rejects invented text", () => {
    expect(excerptInSource("Le théorème a été publié en 1949 par Claude Shannon", source)).toBe(false);
    expect(excerptInSource("Nyquist", source)).toBe(true); // short but present
    expect(excerptInSource("abc", source)).toBe(false); // too short to justify anything
  });

  it("normalizes case and unicode", () => {
    expect(normalizeText("  **Fréquence**  de NYQUIST ")).toBe("fréquence de nyquist");
  });
});

describe("duplicates", () => {
  it("detects near-identical prompts", () => {
    const a = "What is the worst-case complexity of quicksort?";
    const b = "What is the worst case complexity of Quicksort?";
    expect(similarity(a, b)).toBeGreaterThan(0.8);
    expect(isDuplicate(b, [a])).toBe(true);
    expect(isDuplicate("Is merge sort stable?", [a])).toBe(false);
  });
});

describe("detectLanguage", () => {
  it("detects French and English", () => {
    expect(detectLanguage(source)).toBe("fr");
    expect(detectLanguage("Merge sort splits the list in two halves and merges the sorted halves.")).toBe("en");
  });
});

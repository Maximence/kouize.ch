import { describe, expect, it } from "vitest";
import { sameTopic } from "@/lib/markdown/excerpt";
import { imageName, imageRefs } from "@/lib/markdown/images";

const kept = [
  {
    prompt: "What happens when a signal is sampled below the Nyquist rate?",
    concept: "Aliasing",
    excerpt: "The copies of its spectrum overlap and the high frequencies fold back.",
  },
];

describe("same-topic check", () => {
  it("drops a question on a concept already covered, even reworded", () => {
    expect(sameTopic({ prompt: "Which phenomenon makes high frequencies fold back?", concept: "aliasing", excerpt: "Other." }, kept)).toBe(true);
  });

  it("drops a question resting on the same sentence of the notes", () => {
    expect(
      sameTopic(
        { prompt: "True or false: spectral copies overlap", concept: "Spectral copies", excerpt: "The copies of its spectrum overlap and the high frequencies fold back." },
        kept,
      ),
    ).toBe(true);
  });

  it("keeps a question on a different idea", () => {
    expect(
      sameTopic(
        { prompt: "What does an anti-aliasing filter remove?", concept: "Anti-aliasing filter role", excerpt: "A low-pass filter removes the frequencies above half the sampling rate." },
        kept,
      ),
    ).toBe(false);
  });
});

describe("image references", () => {
  it("finds Markdown and HTML images", () => {
    const md = 'Text ![Fig. 1](figures/Fig%201.PNG "title") and <img alt="Plot" src="./plot.svg"> and ![](https://x.org/a.png)';
    expect(imageRefs(md)).toEqual([
      { alt: "Fig. 1", src: "figures/Fig%201.PNG" },
      { alt: "", src: "https://x.org/a.png" },
      { alt: "Plot", src: "./plot.svg" },
    ]);
  });

  it("matches images by file name only", () => {
    expect(imageName("figures/Fig%201.PNG?raw=1")).toBe("fig 1.png");
    expect(imageName("C:\\notes\\img\\Plot.svg")).toBe("plot.svg");
  });
});

import GithubSlugger from "github-slugger";
import type { Heading, Root } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export type ParsedSection = {
  ord: number;
  /** 0 = preamble (before the first heading), 1–3 = heading depth */
  level: number;
  heading: string;
  /** e.g. "Audio > Sampling > Nyquist" */
  headingPath: string;
  /** id that rehype-slug gives the heading in the rendered preview ("" for preamble) */
  anchor: string;
  /** exact markdown source of the section, heading line included */
  content: string;
  charLen: number;
};

export const PATH_SEPARATOR = " > ";
export const PREAMBLE_HEADING = "Introduction";

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml", "toml"])
  .use(remarkGfm)
  .use(remarkMath);

/**
 * Split a Markdown document into sections at every H1–H3 heading.
 * Headings H4+ stay inside their parent section. Code blocks are parsed
 * properly, so a "# comment" in a fenced block is never a heading.
 */
export function parseMarkdown(source: string): ParsedSection[] {
  const tree = processor.parse(source) as Root;

  // Body starts after front matter, if any.
  let bodyStart = 0;
  const first = tree.children[0] as { type: string; position?: Root["position"] } | undefined;
  if (first && (first.type === "yaml" || first.type === "toml")) {
    bodyStart = first.position?.end.offset ?? 0;
  }

  // Slug every heading in document order (H4+ too) so duplicate-suffixes
  // match what rehype-slug produces on the rendered page.
  const slugger = new GithubSlugger();
  const splits: { offset: number; depth: number; text: string; anchor: string }[] = [];
  visit(tree, "heading", (node: Heading) => {
    const text = toString(node).trim();
    const anchor = slugger.slug(text);
    if (node.depth <= 3 && node.position?.start.offset != null) {
      splits.push({ offset: node.position.start.offset, depth: node.depth, text, anchor });
    }
  });

  const sections: ParsedSection[] = [];
  const push = (s: Omit<ParsedSection, "ord" | "charLen">) => {
    const content = s.content.trim();
    if (!content) return;
    sections.push({ ...s, content, ord: sections.length, charLen: content.length });
  };

  const preambleEnd = splits[0]?.offset ?? source.length;
  push({
    level: 0,
    heading: PREAMBLE_HEADING,
    headingPath: PREAMBLE_HEADING,
    anchor: "",
    content: source.slice(bodyStart, preambleEnd),
  });

  const stack: { depth: number; text: string }[] = [];
  splits.forEach((split, i) => {
    while (stack.length && stack[stack.length - 1].depth >= split.depth) stack.pop();
    stack.push({ depth: split.depth, text: split.text || "(untitled)" });
    const end = splits[i + 1]?.offset ?? source.length;
    push({
      level: split.depth,
      heading: split.text || "(untitled)",
      headingPath: stack.map((s) => s.text).join(PATH_SEPARATOR),
      anchor: split.anchor,
      content: source.slice(split.offset, end),
    });
  });

  return sections;
}

/** Text of a section without its own heading line, for "is this section empty?" checks. */
export function sectionBody(section: Pick<ParsedSection, "content" | "level">): string {
  if (section.level === 0) return section.content;
  const nl = section.content.indexOf("\n");
  return nl === -1 ? "" : section.content.slice(nl + 1).trim();
}

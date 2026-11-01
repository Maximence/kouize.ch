import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { imageName, isRemoteImage } from "@/lib/markdown/images";
import { cn } from "@/lib/utils";

/** Relative images are looked up by file name among the subject's uploaded images. */
function imageComponent(images?: Record<string, string>): Components["img"] {
  return function NoteImage({ src, alt }) {
    const ref = typeof src === "string" ? src : "";
    const url = isRemoteImage(ref) ? ref : images?.[imageName(ref)];
    if (url) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={url} alt={alt ?? ""} className="max-w-full rounded-md" loading="lazy" />;
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
        🖼 {alt || ref || "image"} <span className="opacity-70">(image non envoyée)</span>
      </span>
    );
  };
}

const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target={href?.startsWith("#") ? undefined : "_blank"} rel="noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

/** Render course-note Markdown: GFM tables, math, highlighted code, heading anchors. */
export function MarkdownView({
  source,
  className,
  inline,
  images,
}: {
  source: string;
  className?: string;
  inline?: boolean;
  /** Uploaded images of the subject: file name (lowercase) → URL. */
  images?: Record<string, string>;
}) {
  return (
    <div className={cn(inline ? "md-inline" : "md-prose", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkFrontmatter, remarkGfm, remarkMath]}
        // slug before katex so heading ids come from the TeX source, like the parser
        rehypePlugins={[rehypeSlug, [rehypeKatex, { throwOnError: false }], [rehypeHighlight, { detect: false }]]}
        components={{ ...components, img: imageComponent(images) }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

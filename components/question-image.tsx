/** A figure from the notes shown with a question. */
export function QuestionImage({ id, alt, className }: { id: string | null | undefined; alt?: string | null; className?: string }) {
  if (!id) return null;
  return (
    <figure className={className} data-testid="question-image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/images/${id}`}
        alt={alt || "Figure tirée des notes"}
        className="max-h-80 w-auto max-w-full rounded-md border bg-white object-contain"
        loading="lazy"
      />
      {alt && <figcaption className="mt-1 text-xs text-muted-foreground">{alt}</figcaption>}
    </figure>
  );
}

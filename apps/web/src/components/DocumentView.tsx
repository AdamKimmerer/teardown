import { useMemo, useState } from "react";
import type { DocumentImage } from "@teardown/core/api-contract";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ImageLightbox } from "./ImageLightbox.js";
import styles from "./DocumentView.module.css";

// Renders a document's Markdown with every [IMAGE_n] replaced by capture n's image. Raw HTML in
// the Markdown is never rendered (react-markdown's default), so model output cannot inject
// markup. Clicking an image opens it in a lightbox over the page.
export function DocumentView({
  markdown,
  images,
}: {
  markdown: string;
  images: DocumentImage[];
}) {
  const [open, setOpen] = useState<number | null>(null);

  // The components close over setOpen, so they are rebuilt only when the images change.
  const components = useMemo<Components>(
    () => ({
      img: ({ src, alt }) => {
        const index = images.findIndex((image) => image.url === src);
        return (
          <button
            type="button"
            className={styles.imageButton}
            onClick={() => setOpen(index)}
            aria-label={`Enlarge ${alt ?? "capture"}`}
          >
            <img
              src={typeof src === "string" ? src : undefined}
              alt={alt ?? ""}
              loading="lazy"
              className={styles.image}
            />
          </button>
        );
      },
      // Links in a document point at competitors' sites; open them away from the app.
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      ),
    }),
    [images],
  );

  return (
    <article className={styles.document}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {withImages(markdown, images)}
      </ReactMarkdown>
      {open !== null && open >= 0 && (
        <ImageLightbox
          images={images}
          index={open}
          onNavigate={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </article>
  );
}

// [IMAGE_n] → a Markdown image. The URL goes in angle brackets so any characters in a signed
// link are taken literally.
function withImages(markdown: string, images: DocumentImage[]): string {
  const urls = new Map(images.map((image) => [image.n, image.url]));
  return markdown.replace(
    /\[IMAGE_(\d+)\]/g,
    (_placeholder, digits: string) => {
      const url = urls.get(Number(digits));
      return url
        ? `![Capture ${digits}](<${url}>)`
        : `*(capture ${digits} is not available)*`;
    },
  );
}

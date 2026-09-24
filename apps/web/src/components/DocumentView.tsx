import type { DocumentImage } from "@teardown/core/api-contract";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./DocumentView.module.css";

// Renders a document's Markdown with every [IMAGE_n] replaced by capture n's image. Raw HTML in
// the Markdown is never rendered (react-markdown's default), so model output cannot inject markup.
export function DocumentView({
  markdown,
  images,
}: {
  markdown: string;
  images: DocumentImage[];
}) {
  return (
    <article className={styles.document}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {withImages(markdown, images)}
      </ReactMarkdown>
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

const components: Components = {
  // Each image opens full size in a new tab.
  img: ({ src, alt }) => (
    <a
      href={typeof src === "string" ? src : undefined}
      target="_blank"
      rel="noreferrer"
      className={styles.imageLink}
    >
      <img
        src={typeof src === "string" ? src : undefined}
        alt={alt ?? ""}
        loading="lazy"
        className={styles.image}
      />
    </a>
  ),
  // Links in a document point at competitors' sites; open them away from the app.
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { DocumentImage } from "@teardown/core/api-contract";
import styles from "./ImageLightbox.module.css";

type Props = {
  images: DocumentImage[];
  index: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
};

// A capture at full size, over the page rather than in a new tab. Esc or a click on the dark
// area closes it; ← and → step through the document's captures; "Open original" is still there
// for anyone who wants the image on its own.
export function ImageLightbox({ images, index, onNavigate, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const image = images[index]!;
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(index - 1);
      if (e.key === "ArrowRight" && hasNext) onNavigate(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [index, hasPrev, hasNext, onNavigate, onClose]);

  return createPortal(
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={`Capture ${image.n}`}
      onClick={onClose}
    >
      <div className={styles.bar} onClick={(e) => e.stopPropagation()}>
        <button
          ref={closeRef}
          className={styles.iconButton}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <span className={styles.title}>
          Capture {image.n} of {images.length}
        </span>
        <a href={image.url} target="_blank" rel="noreferrer">
          Open original ↗
        </a>
      </div>
      <div className={styles.stage}>
        <img
          src={image.url}
          alt={`Capture ${image.n}`}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className={styles.hint}>Esc to close · ← → for other captures</div>
      <button
        className={`${styles.iconButton} ${styles.nav} ${styles.prev}`}
        disabled={!hasPrev}
        aria-label="Previous capture"
        onClick={(e) => {
          e.stopPropagation();
          onNavigate(index - 1);
        }}
      >
        ‹
      </button>
      <button
        className={`${styles.iconButton} ${styles.nav} ${styles.next}`}
        disabled={!hasNext}
        aria-label="Next capture"
        onClick={(e) => {
          e.stopPropagation();
          onNavigate(index + 1);
        }}
      >
        ›
      </button>
    </div>,
    document.body,
  );
}

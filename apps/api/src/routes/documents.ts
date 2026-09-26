import { Hono, type Context } from "hono";
import { checkRefineContract } from "@teardown/core/outputContract";
import { documentTitle } from "@teardown/core/documentTitle";
import type { Document } from "@teardown/core/schemas/document";
import {
  DocumentResponseSchema,
  DocumentVersionResponseSchema,
  RefineRequestSchema,
  RefineResponseSchema,
} from "@teardown/core/api-contract";
import type { AppEnv } from "../appEnv.js";
import { AppError } from "../appError.js";
import { markedTranscript } from "../ai/markedTranscript.js";
import { visionCostUsd } from "../ai/models.js";
import { refineDocument } from "../ai/refine.js";
import { sql } from "../db/client.js";
import { listCapturesForSession } from "../db/queries/captures.js";
import {
  findOwnedDocument,
  findVersionById,
  findVersionByNumber,
  insertVersion,
  listVersionSummaries,
  lockDocument,
  setCurrentVersion,
} from "../db/queries/documents.js";
import { setSessionTitle } from "../db/queries/sessions.js";
import { insertUsageEvent } from "../db/queries/usageEvents.js";
import { imageSource } from "../images/imageSource.js";
import { requireAuth } from "../middleware/auth.js";
import { signedDownload } from "../storage/signedDownload.js";

// How long the image links in a document response stay valid.
const IMAGE_URL_SECONDS = 3_600;

export const documentRoutes = new Hono<AppEnv>();

documentRoutes.use(requireAuth);

async function ownedDocument(c: Context<AppEnv>): Promise<Document> {
  const document = await findOwnedDocument(c.get("userId"), c.req.param("id")!);
  if (document === null)
    throw new AppError("document_not_found", 404, "No such document");
  return document;
}

async function currentVersion(document: Document) {
  const version = document.currentVersionId
    ? await findVersionById(document.currentVersionId)
    : null;
  if (version === null)
    throw new AppError(
      "document_not_found",
      404,
      "The document has no versions",
    );
  return version;
}

// GET /v1/documents/:id — the current version, the version list, and a short-lived link for
// each [IMAGE_n] (capture n's crop or original).
documentRoutes.get("/:id", async (c) => {
  const document = await ownedDocument(c);
  const [version, versions, captures] = await Promise.all([
    currentVersion(document),
    listVersionSummaries(document.id),
    listCapturesForSession(document.sessionId),
  ]);
  const images = await Promise.all(
    captures.map(async (capture, i) => {
      const source = imageSource(capture);
      return {
        n: i + 1,
        captureId: capture.id,
        url: await signedDownload(
          source.bucket,
          source.path,
          IMAGE_URL_SECONDS,
        ),
      };
    }),
  );
  return c.json(
    DocumentResponseSchema.parse({
      document,
      currentVersion: version,
      versions,
      images,
    }),
  );
});

// GET /v1/documents/:id/versions/:n — any earlier version, for the version switcher.
documentRoutes.get("/:id/versions/:n", async (c) => {
  const document = await ownedDocument(c);
  const version = await findVersionByNumber(
    document.id,
    Number(c.req.param("n")),
  );
  if (version === null)
    throw new AppError("version_not_found", 404, "No such version");
  return c.json(DocumentVersionResponseSchema.parse({ version }));
});

// POST /v1/documents/:id/refine — free and unlimited (spine §6). Nothing is saved, and the
// current version stays, when the model declines (its reason is the error message), when the
// edit changes nothing, or when the output breaks the contract (spine §12.1). All three are 422.
documentRoutes.post("/:id/refine", async (c) => {
  const document = await ownedDocument(c);
  const body = RefineRequestSchema.parse(await c.req.json());
  const current = await currentVersion(document);
  const captures = await listCapturesForSession(document.sessionId);
  const result = await refineDocument(
    current.markdown,
    await markedTranscript(document.sessionId, captures),
    body.prompt,
  );

  await insertUsageEvent({
    userId: c.get("userId"),
    sessionId: document.sessionId,
    kind: "refine",
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsdEstimate: visionCostUsd(result.inputTokens, result.outputTokens),
  });

  if (result.outcome === "declined") {
    throw new AppError(
      "refine_declined",
      422,
      result.note || "That request can't be done with this document.",
    );
  }
  if (result.markdown === current.markdown.trim()) {
    throw new AppError(
      "refine_no_change",
      422,
      "That request didn't change anything in the document.",
    );
  }
  const check = checkRefineContract(current.markdown, result.markdown);
  if (!check.ok) {
    throw new AppError(
      "contract_failed",
      422,
      `That edit didn't take: ${check.reasons.join("; ")}`,
    );
  }

  const version = await sql.begin(async (tx) => {
    await lockDocument(tx, document.id);
    const saved = await insertVersion(tx, {
      documentId: document.id,
      markdown: result.markdown,
      source: "refine",
      refinePrompt: body.prompt,
      model: result.model,
    });
    await setCurrentVersion(tx, document.id, saved.id);
    await setSessionTitle(
      tx,
      document.sessionId,
      documentTitle(result.markdown),
    );
    return saved;
  });
  return c.json(
    RefineResponseSchema.parse({ version, note: result.note }),
    201,
  );
});

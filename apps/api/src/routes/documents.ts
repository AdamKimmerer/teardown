import { Hono, type Context } from "hono";
import { checkRefineContract } from "@teardown/core/outputContract";
import { documentTitle } from "@teardown/core/documentTitle";
import type {
  Document,
  DocumentVersion,
} from "@teardown/core/schemas/document";
import {
  DocumentResponseSchema,
  DocumentVersionResponseSchema,
  RefineRequestSchema,
  RefineResponseSchema,
  SetCurrentVersionRequestSchema,
  type RefineResponse,
} from "@teardown/core/api-contract";
import type { AppEnv } from "../appEnv.js";
import { AppError } from "../appError.js";
import { markedTranscript } from "../ai/markedTranscript.js";
import { visionCostUsd } from "../ai/models.js";
import { refineDocument, type RefineResult } from "../ai/refine.js";
import { sql } from "../db/client.js";
import { listCapturesForSession } from "../db/queries/captures.js";
import {
  findOwnedDocument,
  findVersionById,
  findVersionByNumber,
  findVersionInDocument,
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

async function currentVersion(document: Document): Promise<DocumentVersion> {
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

async function versionOf(
  document: Document,
  versionId: string,
): Promise<DocumentVersion> {
  const version = await findVersionInDocument(document.id, versionId);
  if (version === null)
    throw new AppError("version_not_found", 404, "No such version");
  return version;
}

// GET /v1/documents/:id — the current version, every version's summary (the Revisions panel's
// history), and a short-lived link for each [IMAGE_n] (capture n's crop or original).
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

// GET /v1/documents/:id/versions/:n — one version's Markdown.
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

// POST /v1/documents/:id/current — the version the user is looking at becomes current: it opens
// next time and is what exports use.
documentRoutes.post("/:id/current", async (c) => {
  const document = await ownedDocument(c);
  const body = SetCurrentVersionRequestSchema.parse(await c.req.json());
  const version = await versionOf(document, body.versionId);
  await setCurrentVersion(sql, document.id, version.id);
  return c.body(null, 204);
});

// POST /v1/documents/:id/refine — free and unlimited (spine §6). Edits the requested version
// (default: current) into a new child version. Only "edited" saves anything (201); declined, no
// change, and needs-a-web-search are answers (200); an edit that breaks the output contract is
// a 422 and nothing is saved (spine §12.1).
documentRoutes.post("/:id/refine", async (c) => {
  const document = await ownedDocument(c);
  const body = RefineRequestSchema.parse(await c.req.json());
  const base = body.fromVersionId
    ? await versionOf(document, body.fromVersionId)
    : await currentVersion(document);
  const captures = await listCapturesForSession(document.sessionId);
  const allowWebSearch = body.allowWebSearch === true;
  const result = await refineDocument(
    base.markdown,
    await markedTranscript(document.sessionId, captures),
    body.prompt,
    allowWebSearch,
  );
  await recordRefineUsage(c.get("userId"), document.sessionId, result);

  const answer = await refineAnswer(
    document,
    base,
    body.prompt,
    result,
    allowWebSearch,
  );
  return c.json(
    RefineResponseSchema.parse(answer),
    answer.outcome === "edited" ? 201 : 200,
  );
});

// Turns the model's result into the response, saving a version only for a real, valid edit.
async function refineAnswer(
  document: Document,
  base: DocumentVersion,
  prompt: string,
  result: RefineResult,
  allowWebSearch: boolean,
): Promise<RefineResponse> {
  if (result.outcome === "needs_web_search" && !allowWebSearch) {
    return {
      outcome: "needs_web_search",
      note: result.note,
      searchQuery: result.searchQuery,
    };
  }
  if (result.outcome !== "edited") {
    // Declined, or asked for a search again after one was allowed: either way, nothing to save.
    return {
      outcome: "declined",
      note: result.note || "That request can't be done with this document.",
    };
  }
  if (result.markdown === base.markdown.trim()) {
    return {
      outcome: "no_change",
      note: "That request didn't change anything in the document.",
    };
  }
  const check = checkRefineContract(base.markdown, result.markdown);
  if (!check.ok) {
    throw new AppError(
      "contract_failed",
      422,
      `That edit didn't take: ${check.reasons.join("; ")}`,
    );
  }
  const version = await saveRefinedVersion(document, base, prompt, result);
  return {
    outcome: "edited",
    version,
    note: result.note,
    usedWebSearch: result.webSearches > 0,
  };
}

// The new version is a child of the one that was edited, and becomes current.
async function saveRefinedVersion(
  document: Document,
  base: DocumentVersion,
  prompt: string,
  result: RefineResult,
) {
  return sql.begin(async (tx) => {
    await lockDocument(tx, document.id);
    const saved = await insertVersion(tx, {
      documentId: document.id,
      markdown: result.markdown,
      source: "refine",
      parentVersionId: base.id,
      refinePrompt: prompt,
      note: result.note,
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
}

async function recordRefineUsage(
  userId: string,
  sessionId: string,
  result: RefineResult,
): Promise<void> {
  await insertUsageEvent({
    userId,
    sessionId,
    kind: "refine",
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    webSearches: result.webSearches,
    costUsdEstimate: visionCostUsd(
      result.inputTokens,
      result.outputTokens,
      result.webSearches,
    ),
  });
}

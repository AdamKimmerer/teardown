import { toFile } from "openai";
import { openai } from "./openai.js";
import { TRANSCRIBE_MODEL } from "./models.js";

export type TranscribedWord = { word: string; startMs: number; endMs: number };

export type Transcription = {
  words: TranscribedWord[];
  text: string;
  durationSeconds: number;
};

// Transcribes one audio chunk with word timestamps (in chunk time, from 0). The filename's
// extension tells OpenAI the container format, so it is derived from the blob's MIME type.
export async function transcribeAudio(audio: Blob): Promise<Transcription> {
  const file = await toFile(audio, `chunk.${extensionForMime(audio.type)}`);
  const result = await openai.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  const words = (result.words ?? []).map((w) => ({
    word: w.word,
    startMs: Math.round(w.start * 1000),
    endMs: Math.round(w.end * 1000),
  }));

  return { words, text: result.text, durationSeconds: result.duration ?? 0 };
}

function extensionForMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav") || mime.includes("wave")) return "wav";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "webm";
}

import OpenAI from "openai";
import { config } from "../config.js";

// The one OpenAI client. The key never leaves this process (spine §3, managed keys).
export const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

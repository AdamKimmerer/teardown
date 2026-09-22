import type { LocalSession } from "./sessionState.js";

// What the panel asks the service worker for on open and after every STATE_CHANGED.
export type PanelState = {
  signedIn: boolean;
  email: string | null;
  session: LocalSession | null;
  webAppUrl: string;
};

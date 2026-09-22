import { sendMessage } from "../shared/messages.js";

// The onboarding page that asks for the microphone. Chrome will not show this prompt from the
// side panel (spike A), so first use opens this tab; the grant belongs to the extension origin
// and the offscreen recorder can use it from then on.

const button = document.getElementById("grant") as HTMLButtonElement;
const result = document.getElementById("result") as HTMLParagraphElement;

button.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    result.textContent =
      "Done. You can close this tab and go back to the Teardown panel.";
    button.hidden = true;
    await sendMessage({ type: "MIC_GRANTED" });
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    result.textContent = `Chrome said: ${(err as Error).message}. Check the microphone setting in the address bar.`;
  }
});

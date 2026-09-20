// Spike A fallback: request the mic from a visible full-tab extension page.
document.getElementById("grant").addEventListener("click", async () => {
  const out = document.getElementById("out");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const label = stream.getAudioTracks()[0].label;
    stream.getTracks().forEach((t) => t.stop());
    out.textContent = `granted: ${label}\nNow close this tab and return to the side panel.`;
  } catch (err) {
    out.textContent = `${err.name}: ${err.message}`;
  }
});

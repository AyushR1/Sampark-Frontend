export function readCallId(value, origin = window.location.origin) {
  let id = value.trim();
  if (!id) throw new Error("Paste a call link or code to get started.");
  if (/^https?:\/\//i.test(id)) {
    const url = new URL(id);
    if (url.origin !== origin)
      throw new Error("Use a call link from this Sampark website.");
    id = url.searchParams.get("call") || "";
  }
  if (
    !/^sp-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      id,
    )
  ) {
    throw new Error(
      "That call link or code doesn’t look right. Ask for a new one.",
    );
  }
  return id;
}

export function displayName(value) {
  return typeof value === "string"
    ? value.trim().slice(0, 40) || "Guest"
    : "Guest";
}

export function mediaError(error) {
  if (
    ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(
      error.name,
    )
  ) {
    return "Camera or microphone access is blocked. Allow access in your browser’s site settings, then try again. You can also turn video off to use just your microphone.";
  }
  if (
    ["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"].includes(
      error.name,
    )
  ) {
    return "We couldn’t find your camera or microphone. Check your devices, or turn video off and try an audio call.";
  }
  if (
    ["NotReadableError", "TrackStartError", "AbortError"].includes(error.name)
  ) {
    return "Your camera or microphone may be in use. Close other calling apps, then try again.";
  }
  return error.message || "Something went wrong. Please try again.";
}

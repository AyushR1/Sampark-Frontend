export function createCameraTrack(source, zoom, onError) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([source]);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  const { width = 1280, height = 720 } = source.getSettings();
  canvas.width = width;
  canvas.height = height;
  const track = canvas.captureStream(30).getVideoTracks()[0];
  let stopped = false;

  // ponytail: cap canvas work at 1280px/30fps; use native track transforms if mobile CPU becomes a problem.
  const timer = setInterval(() => {
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    // The video element resolves camera rotation; encode those upright pixels,
    // including dimension changes, so the receiver needs no rotation metadata.
    const width = video.videoWidth;
    const height = video.videoHeight;
    const scale = Math.min(1, 1280 / Math.max(width, height));
    const outputWidth = Math.max(2, Math.round((width * scale) / 2) * 2);
    const outputHeight = Math.max(2, Math.round((height * scale) / 2) * 2);
    if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
      canvas.width = outputWidth;
      canvas.height = outputHeight;
    }
    context.drawImage(
      video,
      (width - width / zoom) / 2,
      (height - height / zoom) / 2,
      width / zoom,
      height / zoom,
      0,
      0,
      outputWidth,
      outputHeight,
    );
  }, 1000 / 30);
  video.play().catch(() => {
    if (!stopped)
      onError("Couldn’t start your camera video. Please restart the preview.");
  });

  return {
    track,
    setZoom(value) {
      zoom = value;
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      track.stop();
      video.pause();
      video.srcObject = null;
    },
  };
}

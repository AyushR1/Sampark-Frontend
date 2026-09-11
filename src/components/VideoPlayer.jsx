import { useEffect, useRef, useState } from "react";
import { useCall } from "../Context.jsx";
import Icon from "./Icon.jsx";
import DeviceSettings from "./DeviceSettings.jsx";
import CallAudio from "./CallAudio.jsx";

function Video({ stream, local = false, hidden = false, screen = false }) {
  const video = useRef(null);
  useEffect(() => {
    const element = video.current;
    element.srcObject = stream;
    if (stream) element.play().catch(() => {});
    return () => {
      element.srcObject = null;
    };
  }, [stream]);
  return (
    <video
      ref={video}
      autoPlay
      playsInline
      muted
      className={`${local ? "mirrored" : ""} ${hidden ? "video-hidden" : ""} ${screen ? "screen-video" : ""}`}
      onResize={(event) => {
        const element = event.currentTarget;
        if (local && element.videoHeight)
          element.parentElement.style.setProperty(
            "--camera-aspect",
            element.videoWidth / element.videoHeight,
          );
      }}
      aria-label={
        screen
          ? "Shared screen"
          : local
            ? "Your camera preview"
            : "Other participant’s video"
      }
    />
  );
}

export default function VideoPlayer() {
  const {
    name,
    phase,
    localStream,
    remoteStream,
    remoteName,
    micOn,
    cameraOn,
    remoteVideo,
    remoteMic,
    toggleDevice,
    prepare,
    leaveCall,
    startedAt,
    online,
    setError,
    screenStream,
    remoteScreen,
    shareScreen,
    stopScreenShare,
    sharingPending,
    changingDevice,
    zoom,
    setZoom,
    chatOpen,
    toggleChat,
    unreadMessages,
  } = useCall();
  const stage = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const [showSelf, setShowSelf] = useState(true);
  const [largeSelf, setLargeSelf] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const sharedScreen = remoteScreen || screenStream;
  const connected = phase === "connected";
  const busy = ["preparing", "calling", "incoming", "connecting"].includes(
    phase,
  );
  useEffect(() => {
    const change = () =>
      setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    if (!localStream) {
      setShowSelf(true);
      setLargeSelf(false);
    }
  }, [localStream]);
  useEffect(() => {
    const shortcut = (event) => {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat ||
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]',
        ) ||
        document.querySelector("dialog[open]")
      )
        return;
      if (event.code === "KeyM" || event.code === "KeyV") {
        event.preventDefault();
        toggleDevice(event.code === "KeyM" ? "audio" : "video");
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [toggleDevice]);
  useEffect(() => {
    setElapsed(0);
    if (!startedAt) return;
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [startedAt]);
  const timer = `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}`;

  return (
    <section className="preview-panel" aria-label="Call preview" ref={stage}>
      <div className="panel-heading">
        <span>
          <Icon name="video" size={18} />
          {connected ? remoteName : "Your preview"}
          {connected && !remoteMic && (
            <Icon
              name="micOff"
              size={14}
              aria-hidden="false"
              aria-label="Their microphone is muted"
            />
          )}
        </span>
        <span className="preview-privacy">
          {connected ? (
            <>
              <span className="status-dot" /> {timer}
            </>
          ) : (
            <>
              <Icon name="lock" size={13} /> Only you can see this
            </>
          )}
        </span>
      </div>
      <div className={`video-stage ${connected ? "is-connected" : ""}`}>
        <div className="stage-top">
          {(!connected || sharedScreen) && (
            <span className="stage-chip">
              <span className={`status-dot ${connected ? "" : "soft"}`} />
              {connected
                ? sharedScreen
                  ? remoteScreen
                    ? `${remoteName} is presenting`
                    : "You are presenting"
                  : "CONNECTED"
                : localStream
                  ? "LOOKING GOOD"
                  : "YOUR SPACE"}
            </span>
          )}
          {document.fullscreenEnabled && (
            <button
              className="icon-button fullscreen-button"
              aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              onClick={() =>
                (fullscreen
                  ? document.exitFullscreen()
                  : stage.current.requestFullscreen()
                ).catch(() =>
                  setError("Fullscreen isn’t available in this browser."),
                )
              }
            >
              <Icon name={fullscreen ? "shrink" : "expand"} size={18} />
            </button>
          )}
        </div>
        {connected ? (
          <>
            <Video
              stream={remoteStream}
              hidden={!remoteVideo || !!sharedScreen}
            />
            {sharedScreen && <Video stream={sharedScreen} screen />}
            {!remoteVideo && !sharedScreen && (
              <div className="camera-placeholder">
                <div className="person-avatar">
                  {remoteName.slice(0, 1).toUpperCase()}
                </div>
                <h2>{remoteName}</h2>
                <p>Here with you, audio only.</p>
              </div>
            )}
            <div
              className={`self-preview ${largeSelf ? "self-preview-large" : ""}`}
              hidden={!showSelf}
            >
              <Video stream={localStream} local hidden={!cameraOn} />
              <button
                className="icon-button self-expand"
                aria-label={
                  largeSelf ? "Shrink your preview" : "Enlarge your preview"
                }
                onClick={() => setLargeSelf(!largeSelf)}
              >
                <Icon name={largeSelf ? "shrink" : "expand"} size={14} />
              </button>
              {!cameraOn && (
                <span className="self-initial">
                  {(name || "You").slice(0, 1).toUpperCase()}
                </span>
              )}
              <span>You {!micOn && <Icon name="micOff" size={12} />}</span>
            </div>
          </>
        ) : (
          <>
            <Video
              stream={localStream}
              local
              hidden={!localStream || !cameraOn}
            />
            {(!localStream || !cameraOn) && (
              <div className="camera-placeholder">
                <div className="camera-orbit">
                  <div className="orbit-center">
                    {localStream ? (
                      <span>{(name || "You").slice(0, 1).toUpperCase()}</span>
                    ) : (
                      <Icon name="video" size={36} />
                    )}
                  </div>
                  <span className="orbit-dot" />
                  <span className="orbit-spark">✦</span>
                </div>
                <h2>
                  {localStream
                    ? "A voice is all it takes."
                    : "Make yourself at home."}
                </h2>
                <p>
                  {localStream
                    ? "Your camera is off. You’re still ready to connect."
                    : "Take a moment. Check your camera. Be you."}
                </p>
                {!localStream && (
                  <button
                    className="preview-enable"
                    disabled={busy || !online}
                    onClick={prepare}
                  >
                    {phase === "preparing" ? (
                      <>
                        <span className="spinner" /> Getting ready…
                      </>
                    ) : (
                      <>
                        <Icon name={cameraOn ? "video" : "mic"} size={17} />
                        {cameraOn ? "Enable camera & mic" : "Enable microphone"}
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {!connected && (
          <div className="stage-bottom">
            <span className="name-chip">
              {`${name.trim() || "You"}${name.trim() ? " (you)" : ""}`}
              {!micOn && <Icon name="micOff" size={14} />}
            </span>
            <span className="stage-note">
              {localStream
                ? cameraOn
                  ? "Ready when you are"
                  : "Camera is off"
                : "Camera & mic are off"}
            </span>
          </div>
        )}
      </div>
      <div className="preview-controls">
        {connected && <CallAudio />}
        <div className="device-controls">
          <button
            className={`device-button ${!micOn ? "device-off" : ""}`}
            aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            aria-pressed={!micOn}
            aria-keyshortcuts="Alt+M"
            title="Toggle microphone (Alt+M)"
            disabled={phase === "preparing" || changingDevice}
            onClick={() => toggleDevice("audio")}
          >
            <Icon name={micOn ? "mic" : "micOff"} />
            <span>{micOn ? "Mic on" : "Mic off"}</span>
          </button>
          <button
            className={`device-button ${!cameraOn ? "device-off" : ""}`}
            aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
            aria-pressed={!cameraOn}
            aria-keyshortcuts="Alt+V"
            title="Toggle camera (Alt+V)"
            disabled={phase === "preparing" || changingDevice}
            onClick={() => toggleDevice("video")}
          >
            <Icon name={cameraOn ? "video" : "videoOff"} />
            <span>{cameraOn ? "Video on" : "Video off"}</span>
          </button>
        </div>
        <DeviceSettings />
        {connected && (
          <button
            className="device-button"
            onClick={toggleChat}
            aria-label={chatOpen ? "Close chat" : "Open chat"}
            aria-expanded={chatOpen}
            aria-controls="call-panel"
          >
            <Icon name="chat" /> Chat{" "}
            {unreadMessages > 0 && (
              <span className="unread-count">{unreadMessages}</span>
            )}
          </button>
        )}
        {connected && navigator.mediaDevices?.getDisplayMedia && (
          <button
            className={`device-button ${screenStream ? "sharing-active" : ""}`}
            disabled={sharingPending}
            aria-pressed={!!screenStream}
            onClick={() => (screenStream ? stopScreenShare() : shareScreen())}
          >
            <Icon name="screen" />
            <span>
              {sharingPending
                ? "Opening…"
                : screenStream
                  ? "Stop sharing"
                  : "Share screen"}
            </span>
          </button>
        )}
        {connected && (
          <button className="device-button leave-button" onClick={leaveCall}>
            <Icon name="phoneOff" /> Leave call
          </button>
        )}
        {localStream && cameraOn && (
          <div className="preview-zoom">
            <label htmlFor="preview-zoom">Zoom</label>
            <input
              id="preview-zoom"
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={zoom}
              aria-label="Camera zoom"
              aria-valuetext={`${zoom.toFixed(1)}×`}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <output htmlFor="preview-zoom">{zoom.toFixed(1)}×</output>
            <button
              type="button"
              className="zoom-reset"
              onClick={() => setZoom(1)}
              disabled={zoom === 1}
            >
              Reset
            </button>
          </div>
        )}
        {connected && (
          <button
            className="stop-preview"
            onClick={() => setShowSelf(!showSelf)}
          >
            {showSelf ? "Hide self view" : "Show self view"}
          </button>
        )}
        <span className="controls-hint">
          {connected ? "Enjoy the moment." : "Settle in before you join."}
        </span>
        {localStream && !connected && (
          <button className="stop-preview" onClick={leaveCall}>
            Stop preview
          </button>
        )}
      </div>
    </section>
  );
}

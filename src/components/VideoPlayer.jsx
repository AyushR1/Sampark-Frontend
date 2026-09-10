import { useEffect, useRef, useState } from "react";
import { useCall } from "../Context.jsx";
import Icon from "./Icon.jsx";

function Video({ stream, local = false, hidden = false }) {
  const video = useRef(null);
  const [needsPlay, setNeedsPlay] = useState(false);
  useEffect(() => {
    const element = video.current;
    element.srcObject = stream;
    let active = true;
    setNeedsPlay(false);
    if (stream)
      element.play().catch(() => {
        if (active && !local) setNeedsPlay(true);
      });
    return () => {
      active = false;
      element.srcObject = null;
    };
  }, [stream, local]);
  return (
    <>
      <video
        ref={video}
        autoPlay
        playsInline
        muted={local}
        className={`${local ? "mirrored" : ""} ${hidden ? "video-hidden" : ""}`}
        aria-label={local ? "Your camera preview" : "Other participant’s video"}
      />
      {needsPlay && (
        <button
          className="button playback-button"
          onClick={() =>
            video.current
              .play()
              .then(() => setNeedsPlay(false))
              .catch(() => setNeedsPlay(true))
          }
        >
          <Icon name="mic" /> Tap to play call audio
        </button>
      )}
    </>
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
  } = useCall();
  const stage = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const connected = phase === "connected";
  const busy = ["preparing", "calling", "incoming", "connecting"].includes(
    phase,
  );
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
    <section className="preview-panel" aria-label="Call preview">
      <div className="panel-heading">
        <span>
          <Icon name="video" size={18} />
          {connected ? "Your conversation" : "Your preview"}
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
      <div
        className={`video-stage ${connected ? "is-connected" : ""}`}
        ref={stage}
      >
        <div className="stage-top">
          <span className="stage-chip">
            <span className={`status-dot ${connected ? "" : "soft"}`} />
            {connected
              ? "CONNECTED"
              : localStream
                ? "LOOKING GOOD"
                : "YOUR SPACE"}
          </span>
          {connected && document.fullscreenEnabled && (
            <button
              className="icon-button fullscreen-button"
              aria-label="Enter fullscreen"
              onClick={() =>
                stage.current
                  .requestFullscreen()
                  .catch(() =>
                    setError("Fullscreen isn’t available in this browser."),
                  )
              }
            >
              <Icon name="expand" size={18} />
            </button>
          )}
        </div>
        {connected ? (
          <>
            <Video stream={remoteStream} hidden={!remoteVideo} />
            {!remoteVideo && (
              <div className="camera-placeholder">
                <div className="person-avatar">
                  {remoteName.slice(0, 1).toUpperCase()}
                </div>
                <h2>{remoteName}</h2>
                <p>Here with you, audio only.</p>
              </div>
            )}
            <div className="self-preview">
              <Video stream={localStream} local hidden={!cameraOn} />
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
        <div className="stage-bottom">
          <span className="name-chip">
            {connected
              ? remoteName
              : `${name.trim() || "You"}${name.trim() ? " (you)" : ""}`}
            {(connected ? !remoteMic : !micOn) && (
              <Icon name="micOff" size={14} />
            )}
          </span>
          <span className="stage-note">
            {connected
              ? "A little closer."
              : localStream
                ? cameraOn
                  ? "Ready when you are"
                  : "Camera is off"
                : "Camera & mic are off"}
          </span>
        </div>
      </div>
      <div className="preview-controls">
        <div className="device-controls">
          <button
            className={`device-button ${!micOn ? "device-off" : ""}`}
            aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            aria-pressed={!micOn}
            disabled={phase === "preparing"}
            onClick={() => toggleDevice("audio")}
          >
            <Icon name={micOn ? "mic" : "micOff"} />
            <span>{micOn ? "Mic on" : "Mic off"}</span>
          </button>
          <button
            className={`device-button ${!cameraOn ? "device-off" : ""}`}
            aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
            aria-pressed={!cameraOn}
            disabled={phase === "preparing"}
            onClick={() => toggleDevice("video")}
          >
            <Icon name={cameraOn ? "video" : "videoOff"} />
            <span>{cameraOn ? "Video on" : "Video off"}</span>
          </button>
        </div>
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

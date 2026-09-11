import { useEffect, useRef, useState } from "react";
import { useCall } from "../Context.jsx";
import Icon from "./Icon.jsx";

export default function DeviceSettings() {
  const dialog = useRef(null);
  const [devices, setDevices] = useState([]);
  const [open, setOpen] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const {
    localStream,
    micOn,
    deviceIds,
    changeDevice,
    changingDevice,
    phase,
    speakerId,
    setSpeakerId,
    error,
    setError,
  } = useCall();

  useEffect(() => {
    let active = true;
    const refresh = () =>
      navigator.mediaDevices
        ?.enumerateDevices()
        .then((list) => {
          if (active) setDevices(list);
        })
        .catch(() => {
          if (active) setDevices([]);
        });
    refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener("devicechange", refresh);
    };
  }, [localStream]);
  useEffect(() => {
    if (!open || !localStream) return;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(localStream);
    const analyser = context.createAnalyser();
    source.connect(analyser);
    context.resume().catch(() => {});
    const samples = new Float32Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      setMicLevel(
        Math.min(
          1,
          Math.sqrt(
            samples.reduce((sum, value) => sum + value * value, 0) /
              samples.length,
          ) * 4,
        ),
      );
    }, 100);
    return () => {
      clearInterval(timer);
      source.disconnect();
      context.close();
      setMicLevel(0);
    };
  }, [open, localStream]);

  return (
    <>
      <button
        className="device-button"
        onClick={() => {
          setOpen(true);
          dialog.current.showModal();
        }}
      >
        <Icon name="settings" /> <span>Devices</span>
      </button>
      <dialog
        ref={dialog}
        className="help-dialog device-dialog"
        aria-labelledby="devices-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <button
          className="icon-button dialog-close"
          aria-label="Close device settings"
          onClick={() => dialog.current.close()}
        >
          <Icon name="close" />
        </button>
        <h2 id="devices-title">Camera & audio</h2>
        <p>
          Choose the devices you want to use. Enable your preview to see their
          names.
        </p>
        {[
          ["audio", "Microphone"],
          ["video", "Camera"],
        ].map(([kind, label]) => (
          <label className="device-field" key={kind}>
            {label}
            <select
              aria-label={label}
              value={deviceIds[kind]}
              disabled={changingDevice || phase === "preparing"}
              onChange={(event) => changeDevice(kind, event.target.value)}
            >
              <option value="">System default</option>
              {devices
                .filter(
                  (device) => device.kind === `${kind}input` && device.deviceId,
                )
                .map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `${label} ${index + 1}`}
                  </option>
                ))}
            </select>
          </label>
        ))}
        {localStream && (
          <label className="device-field">
            Microphone activity
            <meter
              min="0"
              max="1"
              value={micLevel}
              aria-label="Microphone activity"
            />
            <span>
              {micOn
                ? "Speak or sing to check your microphone."
                : "Your microphone is muted."}
            </span>
          </label>
        )}
        {typeof HTMLMediaElement.prototype.setSinkId === "function" && (
          <label className="device-field">
            Speaker
            <select
              aria-label="Speaker"
              value={speakerId}
              onChange={async (event) => {
                const id = event.target.value;
                try {
                  const probe = new Audio();
                  await probe.setSinkId(id);
                  setSpeakerId(id);
                } catch {
                  setError(
                    "Couldn’t select that speaker. Check your browser’s audio permissions.",
                  );
                }
              }}
            >
              <option value="">System default</option>
              {devices
                .filter(
                  (device) => device.kind === "audiooutput" && device.deviceId,
                )
                .map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Speaker ${index + 1}`}
                  </option>
                ))}
            </select>
          </label>
        )}
        <p>
          Shortcuts: Alt + M for microphone, Alt + V for camera. Camera zoom
          changes what both of you see.
        </p>
        {error && <p role="alert">{error}</p>}
        <button
          className="button primary"
          onClick={() => dialog.current.close()}
        >
          Done
        </button>
      </dialog>
    </>
  );
}

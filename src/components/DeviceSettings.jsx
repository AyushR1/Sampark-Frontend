import { useEffect, useRef, useState } from "react";
import { useCall } from "../Context.jsx";
import Icon from "./Icon.jsx";

export default function DeviceSettings() {
  const dialog = useRef(null);
  const [devices, setDevices] = useState([]);
  const {
    localStream,
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

  return (
    <>
      <button
        className="device-button"
        onClick={() => dialog.current.showModal()}
      >
        <Icon name="settings" /> <span>Devices</span>
      </button>
      <dialog
        ref={dialog}
        className="help-dialog device-dialog"
        aria-labelledby="devices-title"
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
          Shortcuts: Alt + M for microphone, Alt + V for camera. Preview zoom
          only changes your view.
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

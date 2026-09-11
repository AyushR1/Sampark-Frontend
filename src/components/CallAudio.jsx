import { useEffect, useRef, useState } from "react";
import { useCall } from "../Context.jsx";
import Icon from "./Icon.jsx";

export default function CallAudio() {
  const { remoteStream, speakerId, setError } = useCall();
  const audio = useRef(null);
  const [needsPlay, setNeedsPlay] = useState(false);
  useEffect(() => {
    const element = audio.current;
    let active = true;
    element.srcObject = remoteStream;
    element
      .play()
      .then(() => {
        if (active) setNeedsPlay(false);
      })
      .catch(() => {
        if (active) setNeedsPlay(true);
      });
    return () => {
      active = false;
      element.srcObject = null;
    };
  }, [remoteStream]);
  useEffect(() => {
    audio.current
      .setSinkId?.(speakerId)
      .catch(() =>
        setError(
          "Couldn’t use the selected speaker. Choose another in Devices.",
        ),
      );
  }, [speakerId]);
  return (
    <>
      <audio
        ref={audio}
        aria-label="Call audio"
        onPlaying={() => setNeedsPlay(false)}
        onPause={() => {
          if (remoteStream) setNeedsPlay(true);
        }}
      />
      {needsPlay && (
        <button
          className="device-button sharing-active"
          onClick={() =>
            audio.current
              .play()
              .then(() => setNeedsPlay(false))
              .catch(() => setNeedsPlay(true))
          }
        >
          <Icon name="mic" /> Enable call audio
        </button>
      )}
    </>
  );
}

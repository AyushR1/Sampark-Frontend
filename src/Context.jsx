import { createContext, useContext, useEffect, useRef, useState } from "react";
import Peer from "peerjs";
import { displayName, mediaError, readCallId } from "./call-utils.js";

const CallContext = createContext(null);
export const useCall = () => useContext(CallContext);

export function CallProvider({ children }) {
  const [name, setName] = useState("");
  const [phase, setPhase] = useState("idle");
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteName, setRemoteName] = useState("");
  const [remoteVideo, setRemoteVideo] = useState(true);
  const [remoteMic, setRemoteMic] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [peerId, setPeerId] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [signalReady, setSignalReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [startedAt, setStartedAt] = useState(null);
  const runtime = useRef({ epoch: 0 });
  const r = runtime.current;
  r.name = name;
  r.micOn = micOn;
  r.cameraOn = cameraOn;

  function clearConversation() {
    clearTimeout(r.timer);
    const { data, media } = r;
    r.data = null;
    r.media = null;
    r.accepted = false;
    data?.close();
    media?.close();
    setRemoteStream(null);
    setStartedAt(null);
  }

  function reset(message = "", update = true) {
    r.epoch += 1;
    clearTimeout(r.timer);
    const { data, media, peer, stream } = r;
    Object.assign(r, {
      data: null,
      media: null,
      peer: null,
      stream: null,
      start: null,
      accepted: false,
    });
    data?.close();
    media?.close();
    peer?.destroy();
    stream?.getTracks().forEach((track) => track.stop());
    if (!update) return;
    setLocalStream(null);
    setRemoteStream(null);
    setStartedAt(null);
    setPeerId("");
    setSignalReady(false);
    setPhase("idle");
    setNotice(message);
  }

  function fail(message) {
    reset();
    setError(message);
  }

  function startCallTimeout() {
    clearTimeout(r.timer);
    r.timer = setTimeout(
      () =>
        fail(
          "The call didn’t connect. Check that the other person is still here, then try again. If you’re on a restricted network, try another connection.",
        ),
      45000,
    );
  }

  function attachMedia(media) {
    r.media = media;
    media.on("stream", (stream) => {
      if (r.media !== media) return;
      clearTimeout(r.timer);
      setRemoteStream(stream);
      setStartedAt(Date.now());
      setPhase("connected");
    });
    media.on("close", () => {
      if (r.media === media)
        reset(
          "The call has ended. Thanks for making a little time to connect.",
        );
    });
    media.on("error", () => {
      if (r.media === media)
        fail("The call connection was interrupted. Please try again.");
    });
  }

  function attachData(data, outgoing) {
    setError("");
    setNotice("");
    r.data = data;
    r.accepted = false;
    startCallTimeout();
    data.on("open", () => {
      if (r.data !== data) return data.close();
      if (!outgoing) {
        setRemoteName(displayName(data.metadata?.name));
        setPhase("incoming");
      }
      data.send({ type: "devices", camera: r.cameraOn, mic: r.micOn });
    });
    data.on("data", (message) => {
      if (r.data !== data || !message || typeof message !== "object") return;
      if (message.type === "devices") {
        if (typeof message.camera === "boolean") setRemoteVideo(message.camera);
        if (typeof message.mic === "boolean") setRemoteMic(message.mic);
      }
      if (message.type === "accept" && outgoing && !r.accepted) {
        r.accepted = true;
        setRemoteName(displayName(message.name));
        setPhase("connecting");
        startCallTimeout();
        const media = r.peer.call(data.peer, r.stream);
        if (media) attachMedia(media);
        else fail("Couldn’t start the call. Please try again.");
      }
    });
    data.on("close", () => {
      if (r.data === data)
        reset(
          "The other person left or declined the call. You can start a new one anytime.",
        );
    });
    data.on("error", () => {
      if (r.data === data)
        fail(
          "Couldn’t reach the other person. Ask them to keep their call link open and try again.",
        );
    });
  }

  async function prepare() {
    if (r.start) return r.start;
    if (r.peer?.open && r.stream) return r.peer;
    if (!navigator.onLine) {
      setError("You’re offline. Reconnect to the internet, then try again.");
      return null;
    }
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      !window.RTCPeerConnection
    ) {
      setError(
        "Calling needs HTTPS and a browser with camera and microphone support. Try a current browser.",
      );
      return null;
    }
    // End an old signaling session before creating a replacement.
    if (r.peer) reset();
    const epoch = r.epoch;
    setError("");
    setNotice("");
    setPhase("preparing");
    r.start = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: r.cameraOn
            ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user",
              }
            : false,
        });
        if (epoch !== r.epoch) {
          stream.getTracks().forEach((track) => track.stop());
          return null;
        }
        r.stream = stream;
        stream.getAudioTracks().forEach((track) => {
          track.enabled = r.micOn;
        });
        stream.getTracks().forEach((track) =>
          track.addEventListener("ended", () => {
            if (r.stream === stream)
              fail(
                "A camera or microphone was disconnected. Check your devices and start again.",
              );
          }),
        );
        setLocalStream(stream);
        // ponytail: public signaling/ICE services; add managed TURN for guaranteed relay availability.
        const peer = new Peer(`sp-${crypto.randomUUID()}`, {
          secure: true,
          debug: 0,
        });
        r.peer = peer;
        peer.on("connection", (data) => {
          if (r.peer !== peer || r.data || data.metadata?.app !== "sampark") {
            data.on("open", () => data.close());
            data.on("error", () => data.close());
            return;
          }
          attachData(data, false);
        });
        peer.on("call", (media) => {
          if (
            r.peer !== peer ||
            !r.accepted ||
            r.media ||
            media.peer !== r.data?.peer
          )
            return media.close();
          attachMedia(media);
          media.answer(r.stream);
        });
        peer.on("error", (err) => {
          if (r.peer !== peer || !peer.open) return;
          if (err.type === "peer-unavailable")
            fail(
              "That call is no longer available. Ask the other person for a fresh link.",
            );
          else
            fail(
              "The calling service couldn’t connect. Check your internet connection and try again.",
            );
        });
        peer.on("disconnected", () => {
          if (r.peer !== peer) return;
          setSignalReady(false);
          setNotice(
            "The call service disconnected. Your active call can continue; start a new session to receive more calls.",
          );
        });
        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () =>
              finish(
                new Error(
                  "The calling service is taking too long. Please try again.",
                ),
              ),
            15000,
          );
          const finish = (error) => {
            clearTimeout(timer);
            peer.off("open", opened);
            peer.off("error", finish);
            peer.off("close", closed);
            error ? reject(error) : resolve();
          };
          const opened = () => finish();
          const closed = () => finish(new Error("Call setup was cancelled."));
          peer.once("open", opened);
          peer.once("error", finish);
          peer.once("close", closed);
        });
        if (epoch !== r.epoch) return null;
        setPeerId(peer.id);
        setSignalReady(true);
        setPhase("ready");
        return peer;
      } catch (err) {
        if (epoch === r.epoch) fail(mediaError(err));
        return null;
      } finally {
        if (epoch === r.epoch) r.start = null;
      }
    })();
    return r.start;
  }

  async function joinCall(value) {
    if (r.data || r.start) return;
    let id;
    try {
      id = readCallId(value);
      if (id === r.peer?.id)
        throw new Error(
          "That’s your own call link. Share it with someone, or paste their link here.",
        );
    } catch (err) {
      setError(err.message);
      return;
    }
    const peer = await prepare();
    if (!peer || r.data) return;
    setError("");
    setNotice("");
    setRemoteName("your friend");
    setRemoteVideo(true);
    setRemoteMic(true);
    setPhase("calling");
    attachData(
      peer.connect(id, {
        reliable: true,
        metadata: { app: "sampark", name: displayName(r.name) },
      }),
      true,
    );
  }

  function answerCall() {
    if (!r.data?.open || r.accepted) return;
    r.accepted = true;
    setPhase("connecting");
    startCallTimeout();
    r.data.send({ type: "accept", name: displayName(r.name) });
  }

  function declineCall() {
    clearConversation();
    setPhase("ready");
    setNotice("Call declined. Your link is still ready to share.");
  }

  function toggleDevice(kind) {
    const isCamera = kind === "video";
    const enabled = isCamera ? !cameraOn : !micOn;
    if (isCamera && enabled && r.stream && !r.stream.getVideoTracks().length) {
      setError(
        "This is an audio-only session. End it and turn video on before starting a new call.",
      );
      return;
    }
    (isCamera ? setCameraOn : setMicOn)(enabled);
    r.stream
      ?.getTracks()
      .filter((track) => track.kind === kind)
      .forEach((track) => {
        track.enabled = enabled;
      });
    if (r.data?.open)
      r.data.send({
        type: "devices",
        camera: isCamera ? enabled : cameraOn,
        mic: isCamera ? micOn : enabled,
      });
  }

  useEffect(() => {
    const handleOffline = () => {
      setOnline(false);
      reset("You’re offline. Reconnect to start another call.");
    };
    const handleOnline = () => {
      setOnline(true);
      setNotice("You’re back online. Ready when you are.");
    };
    const handlePageHide = () => reset();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pagehide", handlePageHide);
      reset("", false);
    };
  }, []);

  return (
    <CallContext.Provider
      value={{
        name,
        setName,
        phase,
        localStream,
        remoteStream,
        remoteName,
        remoteVideo,
        remoteMic,
        micOn,
        cameraOn,
        peerId,
        online,
        signalReady,
        error,
        setError,
        notice,
        setNotice,
        startedAt,
        prepare,
        joinCall,
        answerCall,
        declineCall,
        toggleDevice,
        leaveCall: () => {
          reset("You’ve left the call. Your camera and microphone are off.");
          setError("");
        },
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

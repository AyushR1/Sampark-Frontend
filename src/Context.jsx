import { createContext, useContext, useEffect, useRef, useState } from "react";
import Peer from "peerjs";
import { displayName, mediaError, readCallId } from "./call-utils.js";
import { createCameraTrack } from "./camera-track.js";

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
  const [screenStream, setScreenStream] = useState(null);
  const [remoteScreen, setRemoteScreen] = useState(null);
  const [sharingPending, setSharingPending] = useState(false);
  const [deviceIds, setDeviceIds] = useState({ audio: "", video: "" });
  const [changingDevice, setChangingDevice] = useState(false);
  const [speakerId, setSpeakerId] = useState("");
  const [messages, setMessages] = useState([]);
  const [zoom, setZoomValue] = useState(1);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const runtime = useRef({ epoch: 0 });
  const r = runtime.current;
  r.name = name;
  r.micOn = micOn;
  r.cameraOn = cameraOn;
  r.deviceIds = deviceIds;
  r.zoom = zoom;
  r.chatOpen = chatOpen;

  function setZoom(value) {
    if (!Number.isFinite(value) || value < 1 || value > 3) return;
    r.zoom = value;
    r.camera?.setZoom(value);
    setZoomValue(value);
  }

  function toggleChat() {
    r.chatOpen = !r.chatOpen;
    setChatOpen(r.chatOpen);
    if (r.chatOpen) setUnreadMessages(0);
  }

  function watchTrack(track) {
    track.addEventListener("ended", () => {
      if (r.sourceStream?.getTracks().includes(track))
        fail(
          "A camera or microphone was disconnected. Check your devices and start again.",
        );
    });
  }

  function addMessage(text, own) {
    if (!own && !r.chatOpen) setUnreadMessages((count) => count + 1);
    // ponytail: keep the latest 200 messages in memory; add export for longer history.
    setMessages((previous) => [
      ...previous.slice(-199),
      { text, own, at: Date.now() },
    ]);
  }

  function sendMessage(text) {
    text = text.trim();
    if (!text || text.length > 2000 || !r.accepted || !r.media || !r.data?.open)
      return false;
    try {
      r.data.send({ type: "chat", text });
      addMessage(text, true);
      return true;
    } catch {
      setError("Your message couldn’t be sent. Please try again.");
      return false;
    }
  }

  function stopScreenShare(update = true) {
    const { screen, screenCall } = r;
    r.screen = null;
    r.screenCall = null;
    screen?.getTracks().forEach((track) => track.stop());
    screenCall?.close();
    if (update) setScreenStream(null);
    if (screen && r.data?.open) r.data.send({ type: "screen-stopped" });
  }

  async function shareScreen() {
    if (r.sharing || r.screen || !r.media || !r.accepted) return;
    const { epoch, data } = r;
    r.sharing = true;
    setSharingPending(true);
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      if (r.epoch !== epoch || r.data !== data || !data?.open) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const call = r.peer.call(data.peer, stream, {
        metadata: { type: "screen" },
      });
      if (!call)
        throw new Error("Screen sharing couldn’t start. Please try again.");
      r.screen = stream;
      r.screenCall = call;
      setScreenStream(stream);
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        if (r.screen === stream) stopScreenShare();
      });
      call.on("close", () => {
        if (r.screenCall === call) stopScreenShare();
      });
      call.on("error", () => {
        if (r.screenCall !== call) return;
        stopScreenShare();
        setError(
          "Screen sharing was interrupted. Your call is still connected.",
        );
      });
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      if (r.epoch === epoch && err.name !== "NotAllowedError")
        setError(
          "Couldn’t share your screen. Check screen-recording permissions and try again.",
        );
    } finally {
      if (r.epoch === epoch) {
        r.sharing = false;
        setSharingPending(false);
      }
    }
  }

  async function changeDevice(kind, deviceId) {
    if (!["audio", "video"].includes(kind) || r.changing || r.start) return;
    if (!r.stream) {
      setDeviceIds((ids) => ({ ...ids, [kind]: deviceId }));
      return;
    }
    const { epoch, stream, sourceStream, media } = r;
    const oldTrack = sourceStream
      .getTracks()
      .find((track) => track.kind === kind);
    if (!oldTrack) {
      setError(
        "End this audio-only session and turn video on to choose a camera.",
      );
      return;
    }
    r.changing = true;
    setChangingDevice(true);
    let replacement;
    let camera;
    try {
      replacement = await navigator.mediaDevices.getUserMedia({
        [kind]: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          ...(kind === "audio"
            ? {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              }
            : {}),
        },
      });
      const track = replacement.getTracks()[0];
      if (r.epoch !== epoch || r.media !== media) {
        track.stop();
        return;
      }
      track.enabled = kind === "audio" ? r.micOn : r.cameraOn;
      if (kind === "audio") track.contentHint = "music";
      if (kind === "video") camera = createCameraTrack(track, r.zoom, fail);
      const outgoing = camera?.track || track;
      outgoing.enabled = track.enabled;
      if (media) {
        const sender = media.peerConnection
          ?.getSenders()
          .find((sender) => sender.track?.kind === kind);
        if (!sender)
          throw new Error("That device can’t be changed during this call.");
        await sender.replaceTrack(outgoing);
      }
      if (r.epoch !== epoch || r.media !== media) {
        camera?.stop();
        track.stop();
        return;
      }
      sourceStream.removeTrack(oldTrack);
      sourceStream.addTrack(track);
      stream.removeTrack(
        stream.getTracks().find((track) => track.kind === kind),
      );
      stream.addTrack(outgoing);
      if (camera) {
        r.camera?.stop();
        r.camera = camera;
      }
      watchTrack(track);
      oldTrack.stop();
      setLocalStream(new MediaStream(stream.getTracks()));
      setDeviceIds((ids) => ({ ...ids, [kind]: deviceId }));
    } catch (err) {
      camera?.stop();
      replacement?.getTracks().forEach((track) => track.stop());
      if (r.epoch === epoch) setError(mediaError(err));
    } finally {
      if (r.epoch === epoch) {
        r.changing = false;
        setChangingDevice(false);
      }
    }
  }

  function clearConversation() {
    clearTimeout(r.timer);
    const { data, media } = r;
    r.data = null;
    r.media = null;
    r.accepted = false;
    data?.close();
    media?.close();
    stopScreenShare();
    r.remoteScreenCall?.close();
    r.remoteScreenCall = null;
    setRemoteScreen(null);
    setMessages([]);
    setUnreadMessages(0);
    setRemoteStream(null);
    setStartedAt(null);
  }

  function reset(message = "", update = true) {
    r.epoch += 1;
    clearTimeout(r.timer);
    const { data, media, peer, stream, sourceStream, camera } = r;
    Object.assign(r, {
      data: null,
      media: null,
      peer: null,
      stream: null,
      sourceStream: null,
      camera: null,
      start: null,
      accepted: false,
      sharing: false,
      changing: false,
    });
    stopScreenShare(update);
    r.remoteScreenCall?.close();
    r.remoteScreenCall = null;
    data?.close();
    media?.close();
    peer?.destroy();
    camera?.stop();
    sourceStream?.getTracks().forEach((track) => track.stop());
    stream?.getTracks().forEach((track) => track.stop());
    if (!update) return;
    setLocalStream(null);
    setRemoteScreen(null);
    setSharingPending(false);
    setChangingDevice(false);
    setMessages([]);
    setZoomValue(1);
    setChatOpen(false);
    setUnreadMessages(0);
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
      if (
        message.type === "chat" &&
        r.accepted &&
        r.media &&
        typeof message.text === "string" &&
        message.text.trim() &&
        message.text.length <= 2000
      )
        addMessage(message.text.trim(), false);
      if (message.type === "screen-stopped") {
        const call = r.remoteScreenCall;
        r.remoteScreenCall = null;
        call?.close();
        setRemoteScreen(null);
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
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            ...(r.deviceIds.audio
              ? { deviceId: { exact: r.deviceIds.audio } }
              : {}),
          },
          video: r.cameraOn
            ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user",
                ...(r.deviceIds.video
                  ? { deviceId: { exact: r.deviceIds.video } }
                  : {}),
              }
            : false,
        });
        if (epoch !== r.epoch) {
          stream.getTracks().forEach((track) => track.stop());
          return null;
        }
        r.sourceStream = stream;
        stream.getAudioTracks().forEach((track) => {
          track.enabled = r.micOn;
          track.contentHint = "music";
        });
        stream.getTracks().forEach(watchTrack);
        const sourceVideo = stream.getVideoTracks()[0];
        if (sourceVideo)
          r.camera = createCameraTrack(sourceVideo, r.zoom, fail);
        r.stream = new MediaStream([
          ...stream.getAudioTracks(),
          ...(r.camera ? [r.camera.track] : []),
        ]);
        setLocalStream(r.stream);
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
          if (media.metadata?.type === "screen") {
            if (
              r.peer !== peer ||
              !r.accepted ||
              !r.media ||
              r.remoteScreenCall ||
              media.peer !== r.data?.peer
            )
              return media.close();
            r.remoteScreenCall = media;
            media.on("stream", (stream) => {
              if (r.remoteScreenCall === media) setRemoteScreen(stream);
            });
            const ended = () => {
              if (r.remoteScreenCall !== media) return;
              r.remoteScreenCall = null;
              setRemoteScreen(null);
              media.close();
            };
            media.on("close", ended);
            media.on("error", ended);
            media.answer();
            return;
          }
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
    if (r.changing || r.start) return;
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
    r.sourceStream
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
        screenStream,
        remoteScreen,
        sharingPending,
        shareScreen,
        stopScreenShare,
        deviceIds,
        changeDevice,
        changingDevice,
        speakerId,
        setSpeakerId,
        messages,
        zoom,
        setZoom,
        chatOpen,
        toggleChat,
        unreadMessages,
        sendMessage,
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

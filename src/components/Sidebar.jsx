import { useEffect, useRef, useState } from "react";
import { useCall } from "../Context.jsx";
import Icon from "./Icon.jsx";
import CallChat from "./CallChat.jsx";

export default function Sidebar() {
  const {
    name,
    setName,
    phase,
    peerId,
    online,
    signalReady,
    prepare,
    joinCall,
    answerCall,
    declineCall,
    leaveCall,
    remoteName,
    chatOpen,
  } = useCall();
  const [target, setTarget] = useState(
    () => new URLSearchParams(window.location.search).get("call") || "",
  );
  const [tab, setTab] = useState(target ? "join" : "create");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const linkInput = useRef(null);
  const answer = useRef(null);
  const copyTimer = useRef(null);
  const active = ["calling", "incoming", "connecting", "connected"].includes(
    phase,
  );
  const preparing = phase === "preparing";
  const invite =
    peerId && signalReady
      ? `${window.location.origin}${window.location.pathname}?call=${peerId}`
      : "";
  useEffect(() => {
    if (phase === "incoming") answer.current?.focus();
  }, [phase]);
  useEffect(() => {
    setCopied(false);
    setCopyError("");
    return () => clearTimeout(copyTimer.current);
  }, [invite]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setCopyError("");
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError(
        "Select and copy the link above using your browser’s copy command.",
      );
      linkInput.current?.select();
    }
  }

  return (
    <aside
      id="call-panel"
      className="call-panel"
      aria-label="Start or join a call"
      hidden={phase === "connected" && !chatOpen}
    >
      <div className="call-panel-main">
        <span className="eyebrow">A MOMENT AWAY</span>
        <h2>
          {active
            ? phase === "connected"
              ? "You’re together."
              : phase === "incoming"
                ? "Someone’s here."
                : "Making a connection."
            : "Let’s say hello."}
        </h2>
        <p className="panel-description">
          {active
            ? phase === "connected"
              ? "Good company. No distractions."
              : "Good conversations are worth the wait."
            : "Your people are just a link away."}
        </p>

        {active ? (
          <div className="active-call" aria-live="polite">
            <div
              className={`call-avatar ${phase !== "connected" ? "ringing" : ""}`}
            >
              {phase === "calling" ? (
                <Icon name="users" size={30} />
              ) : (
                remoteName.slice(0, 1).toUpperCase()
              )}
            </div>
            <h3>
              {phase === "calling" ? "Waiting for an answer…" : remoteName}
            </h3>
            <p>
              {phase === "incoming"
                ? "would like to join your call."
                : phase === "connecting"
                  ? "Connecting your camera and microphone…"
                  : phase === "connected"
                    ? "You’re in a private one-to-one call."
                    : "They’ll see your request and let you in."}
            </p>
            {phase === "incoming" ? (
              <div className="answer-actions">
                <button
                  className="button primary"
                  ref={answer}
                  onClick={answerCall}
                >
                  <Icon name="video" /> Accept call
                </button>
                <button className="button secondary" onClick={declineCall}>
                  Decline
                </button>
              </div>
            ) : phase !== "connected" ? (
              <button className="button danger" onClick={leaveCall}>
                <Icon name="phoneOff" />
                {phase === "connected" ? "Leave call" : "Cancel call"}
              </button>
            ) : null}
            <p className="small-note">
              {phase === "connected"
                ? "Your camera and microphone are under your control."
                : "Your media is shared only after the call is accepted."}
            </p>
          </div>
        ) : (
          <>
            <div className="tab-switch" aria-label="Call options">
              <button
                type="button"
                aria-pressed={tab === "create"}
                onClick={() => setTab("create")}
              >
                Create a call
              </button>
              <button
                type="button"
                aria-pressed={tab === "join"}
                onClick={() => setTab("join")}
              >
                Join a call
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (tab === "join") joinCall(target);
                else prepare();
              }}
            >
              <label htmlFor="display-name">
                Your name <span>optional</span>
              </label>
              <input
                id="display-name"
                name="name"
                autoComplete="given-name"
                placeholder="What should we call you?"
                maxLength={40}
                value={name}
                disabled={preparing}
                onChange={(event) => setName(event.target.value)}
              />
              {tab === "create" ? (
                invite ? (
                  <div className="invite-ready">
                    <div className="invite-label">
                      <span className="status-dot" /> Your link is ready
                    </div>
                    <label className="sr-only" htmlFor="invite-link">
                      Your call link
                    </label>
                    <div className="link-field">
                      <Icon name="link" size={17} />
                      <input
                        id="invite-link"
                        ref={linkInput}
                        readOnly
                        value={invite}
                        onFocus={(event) => event.target.select()}
                      />
                    </div>
                    <button
                      className="button primary"
                      type="button"
                      onClick={copyLink}
                    >
                      <Icon name={copied ? "check" : "copy"} size={18} />
                      {copied ? "Link copied!" : "Copy call link"}
                      <Icon name="arrow" size={18} />
                    </button>
                    <p className="copy-status" role="status">
                      {copyError ||
                        (copied
                          ? "Send it to someone you’d love to talk to."
                          : "Share with one person. Keep this tab open.")}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="create-explainer">
                      <span className="small-icon">
                        <Icon name="link" />
                      </span>
                      <p>
                        A fresh link. A familiar face.
                        <span>Create a link and invite someone in.</span>
                      </p>
                    </div>
                    <button
                      className="button primary"
                      disabled={preparing || !online}
                    >
                      {preparing ? (
                        <>
                          <span className="spinner" /> Getting ready…
                        </>
                      ) : (
                        <>
                          <Icon name="video" size={18} /> Create call link{" "}
                          <Icon name="arrow" size={18} />
                        </>
                      )}
                    </button>
                    <p className="small-note">
                      We’ll ask to use your camera and microphone.
                    </p>
                  </>
                )
              ) : (
                <>
                  <label className="join-label" htmlFor="call-link">
                    Call link or code
                  </label>
                  <input
                    id="call-link"
                    name="call-link"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Paste the invitation here"
                    value={target}
                    disabled={preparing}
                    onChange={(event) => setTarget(event.target.value)}
                  />
                  <button
                    className="button primary join-button"
                    disabled={preparing || !online}
                  >
                    {preparing ? (
                      <>
                        <span className="spinner" /> Getting ready…
                      </>
                    ) : (
                      <>
                        Join call <Icon name="arrow" size={18} />
                      </>
                    )}
                  </button>
                  <p className="small-note">
                    The other person will let you in.
                  </p>
                </>
              )}
              {preparing && (
                <button
                  type="button"
                  className="cancel-setup"
                  onClick={leaveCall}
                >
                  Cancel setup
                </button>
              )}
            </form>
          </>
        )}
        {phase === "connected" && <CallChat />}
      </div>
      <div className="panel-footer">
        <Icon name="lock" size={15} />
        <span>No account. No download. Just connection.</span>
      </div>
    </aside>
  );
}

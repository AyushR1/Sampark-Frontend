import { useEffect, useRef, useState } from "react";
import { useCall } from "../Context.jsx";
import Icon from "./Icon.jsx";

export default function CallChat() {
  const { messages, sendMessage, remoteName } = useCall();
  const [draft, setDraft] = useState("");
  const log = useRef(null);
  const follow = useRef(true);
  useEffect(() => {
    if (follow.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);
  return (
    <section className="call-chat" aria-label="Call chat">
      <h3>
        <Icon name="chat" size={16} /> In-call chat
      </h3>
      <div
        ref={log}
        className="chat-messages"
        role="log"
        aria-label="Messages"
        aria-live="polite"
        onScroll={() => {
          const element = log.current;
          follow.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            40;
        }}
      >
        {!messages.length && (
          <p className="chat-empty">
            Send a hello or share a note. Messages clear when you leave.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            className={`chat-message ${message.own ? "own" : ""}`}
            key={index}
          >
            <span>
              {message.own ? "You" : remoteName} ·{" "}
              {new Date(message.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <p>{message.text}</p>
          </div>
        ))}
      </div>
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (sendMessage(draft)) {
            follow.current = true;
            setDraft("");
          }
        }}
      >
        <input
          aria-label="Message"
          placeholder="Write a message…"
          value={draft}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          className="icon-button"
          aria-label="Send message"
          disabled={!draft.trim()}
        >
          <Icon name="arrow" />
        </button>
      </form>
    </section>
  );
}

import { useRef } from "react";
import { useCall } from "./Context.jsx";
import Icon from "./components/Icon.jsx";
import VideoPlayer from "./components/VideoPlayer.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Notifications from "./components/Notifications.jsx";

export default function App() {
  const help = useRef(null);
  const { phase, online } = useCall();
  const inCall = ["calling", "incoming", "connecting", "connected"].includes(
    phase,
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="site-header">
        <a className="brand" href="#main" aria-label="Sampark home">
          <span className="brand-mark">
            <Icon name="video" size={25} />
          </span>
          sampark<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Main navigation">
          <span className="header-note">A little closer, from anywhere.</span>
          <button
            className="help-button"
            onClick={() => help.current.showModal()}
          >
            <Icon name="help" size={18} /> How it works
          </button>
        </nav>
      </header>

      <main id="main">
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="tiny-line" /> MADE FOR REAL CONNECTION
            </div>
            <h1>
              {inCall ? (
                <>
                  A little time.
                  <br />
                  <span>A little closer.</span>
                </>
              ) : (
                <>
                  Less distance.
                  <br />
                  <span>More connection.</span>
                </>
              )}
            </h1>
            <p>
              A catch-up, a big idea, or just a hello.
              <br className="mobile-break" /> Your next good conversation starts
              here.
            </p>
          </div>
          <div className="intro-aside">
            <div className="connection-art" aria-hidden="true">
              <span className="art-person one">
                <span>☺</span>
              </span>
              <span className="art-dots">···</span>
              <span className="art-person two">
                <span>☺</span>
              </span>
              <span className="art-spark">✳</span>
            </div>
            <span>Just you. And your people.</span>
          </div>
        </section>

        <Notifications />
        <div className="workspace">
          <VideoPlayer />
          <Sidebar />
        </div>

        <section className="benefits" aria-label="Made to keep things simple">
          <div>
            <span className="benefit-icon">
              <Icon name="link" />
            </span>
            <p>
              <strong>One link. You’re together.</strong>
              <span>Share a link and let the conversation flow.</span>
            </p>
          </div>
          <div>
            <span className="benefit-icon">
              <Icon name="shield" />
            </span>
            <p>
              <strong>Your conversation, yours.</strong>
              <span>Encrypted in transit. Never recorded by us.</span>
            </p>
          </div>
          <div>
            <span className="benefit-icon">
              <Icon name="spark" />
            </span>
            <p>
              <strong>Less setup. More hello.</strong>
              <span>No sign-ups, downloads, or calendar invites.</span>
            </p>
          </div>
        </section>
      </main>

      <footer>
        <span>
          sampark{" "}
          <span className="footer-meaning">/səm.pərk/ · connection</span>
        </span>
        <span className="footer-status">
          <span className={`status-dot ${online ? "" : "offline"}`} />
          {online ? "Made for one-to-one moments" : "You’re offline"}
        </span>
      </footer>

      <dialog
        ref={help}
        className="help-dialog"
        aria-labelledby="help-title"
        onClick={(event) => {
          if (event.target === help.current) help.current.close();
        }}
      >
        <button
          className="icon-button dialog-close"
          aria-label="Close help"
          onClick={() => help.current.close()}
        >
          <Icon name="close" />
        </button>
        <span className="eyebrow">A HELLO IN THREE STEPS</span>
        <h2 id="help-title">Getting together is simple.</h2>
        <ol className="help-steps">
          <li>
            <strong>Make yourself at home.</strong>
            <p>
              Enter your name and choose whether to use video. Create a call
              link and allow camera and microphone access when your browser
              asks.
            </p>
          </li>
          <li>
            <strong>Send a little invitation.</strong>
            <p>
              Copy your link and send it to one person. Keep this tab open. They
              can enter their name and select “Join call”.
            </p>
          </li>
          <li>
            <strong>Say hello.</strong>
            <p>
              Accept their request to start. Use the mic and camera buttons
              anytime. Leaving stops your devices and expires your link.
            </p>
          </li>
        </ol>
        <details>
          <summary>Camera or microphone not working?</summary>
          <p>
            Allow camera and microphone access in your browser’s site settings.
            Close other apps using your devices, then try again. For an audio
            call, turn video off before creating or joining a call.
          </p>
        </details>
        <details>
          <summary>Having trouble connecting?</summary>
          <p>
            Both people need to keep their tabs open. Ask for a fresh link if
            one has expired. Some work networks and VPNs block browser calls;
            try another connection. Calls depend on the availability of the
            public PeerJS connection service.
          </p>
        </details>
        <details>
          <summary>What stays private?</summary>
          <p>
            No account is needed. Your name is sent to the person you call;
            Sampark does not save your calls or record your media. WebRTC
            encrypts media in transit. Only share your temporary link with
            someone you trust.
          </p>
        </details>
        <button className="button primary" onClick={() => help.current.close()}>
          Got it, let’s connect <Icon name="arrow" size={18} />
        </button>
      </dialog>
    </div>
  );
}

import { useCall } from "../Context.jsx";
import Icon from "./Icon.jsx";

export default function Notifications() {
  const { error, setError, notice, setNotice } = useCall();
  if (!error && !notice) return null;
  return (
    <div
      className={`notification ${error ? "notification-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <Icon name={error ? "help" : "check"} size={20} />
      <p>{error || notice}</p>
      <button
        className="icon-button"
        aria-label="Dismiss message"
        onClick={() => {
          setError("");
          setNotice("");
        }}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

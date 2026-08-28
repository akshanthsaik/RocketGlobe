// src/components/Layout/WelcomeScreen.tsx
import "./WelcomeScreen.css";

interface WelcomeScreenProps {
  onDismiss: () => void;
}

const FEATURES: { title: string; text: string }[] = [
  {
    title: "Globe view",
    text: "Pads and agencies plotted on a flat, schematic globe, colored by launch activity.",
  },
  {
    title: "Launches, pads, rockets, agencies",
    text: "Browse and filter every entity in the local database.",
  },
  {
    title: "Timeline",
    text: "Scrub or auto-play through launch history, camera following along.",
  },
  {
    title: "Background sync",
    text: "Pulls new launches from Launch Library 2 in the background.",
  },
];

/**
 * Shown once, on a genuinely fresh install. Adapted from the README's "What
 * it does" rather than separate marketing copy, so the two never drift.
 */
export function WelcomeScreen({ onDismiss }: WelcomeScreenProps) {
  return (
    <div
      className="welcome-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="welcome-card">
        {/* Same mark as the app icon (src-tauri/icons/source.svg), without its
            background tile so it sits on the card directly. */}
        <svg
          className="welcome-mark"
          viewBox="0 0 1024 1024"
          aria-hidden="true"
        >
          <polygon points="460,760 564,760 512,920" fill="#ff563c" />
          <polygon points="486,760 538,760 512,860" fill="#ffc4b8" />
          <g fill="#ec3013">
            <polygon points="512,150 440,380 584,380" />
            <rect x="440" y="380" width="144" height="310" />
            <polygon points="440,560 440,690 350,760" />
            <polygon points="584,560 584,690 674,760" />
          </g>
          <circle cx="512" cy="470" r="38" fill="#201e1d" />
        </svg>

        <div className="welcome-rule" />
        <div className="welcome-kicker">Welcome</div>
        <h1 id="welcome-title" className="welcome-title">
          Every rocket launch, on a globe
        </h1>
        <p className="welcome-intro">
          Reads a local copy of Launch Library 2. Syncing needs an internet
          connection; everything else works offline, no account, no cloud
          service.
        </p>

        <ul className="welcome-features">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="welcome-feature">
              <div className="welcome-feature-title">{feature.title}</div>
              <div className="welcome-feature-text">{feature.text}</div>
            </li>
          ))}
        </ul>

        <button type="button" className="welcome-cta" onClick={onDismiss}>
          Get started
        </button>
      </div>
    </div>
  );
}

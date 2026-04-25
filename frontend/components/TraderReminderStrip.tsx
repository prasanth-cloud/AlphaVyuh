"use client";

const REMINDERS = [
  "Wait for confirmation, not excitement.",
  "Protect capital before chasing upside.",
  "A missed trade hurts less than a bad one.",
  "Size positions for the bad days too.",
  "Write the reason before you place the trade.",
  "Good process beats perfect prediction.",
  "Review the mistake while it is still fresh.",
];

export default function TraderReminderStrip({
  tone = "app",
}: {
  tone?: "app" | "landing";
}) {
  return (
    <div className={`reminder-strip reminder-strip-${tone}`}>
      <div className="reminder-strip-track">
        {[0, 1].map((copy) => (
          <div key={copy} className="reminder-strip-items" aria-hidden={copy === 1}>
            {REMINDERS.map((item) => (
              <span key={`${copy}-${item}`} className="reminder-chip">
                {item}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

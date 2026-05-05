"use client";

type TimingRecord = {
  name: string;
  at: number;
};

type TimingWindow = Window & {
  __alphavyuhTimings?: TimingRecord[];
};

export function markAppTiming(name: string) {
  if (typeof window === "undefined" || !window.performance?.mark) return;
  const timingWindow = window as TimingWindow;
  const at = Math.round(window.performance.now());
  try {
    window.performance.mark(`alphavyuh:${name}`);
  } catch {
    return;
  }
  timingWindow.__alphavyuhTimings = [
    ...(timingWindow.__alphavyuhTimings ?? []),
    { name, at },
  ].slice(-80);
}

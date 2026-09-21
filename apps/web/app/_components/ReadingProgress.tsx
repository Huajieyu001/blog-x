"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "../public.module.css";

function readingProgress(targetId: string) {
  const target = document.getElementById(targetId);
  if (!target) return 0;

  const bounds = target.getBoundingClientRect();
  const top = window.scrollY + bounds.top;
  const scrollableHeight = Math.max(bounds.height - window.innerHeight, 1);
  return Math.round(Math.min(100, Math.max(0, ((window.scrollY - top) / scrollableHeight) * 100)));
}

export default function ReadingProgress({ targetId }: { targetId: string }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setValue(readingProgress(targetId));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [targetId]);

  return (
    <div
      className={styles.readingProgress}
      role="progressbar"
      aria-label="阅读进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
      style={{ "--reading-progress": `${value}%` } as CSSProperties}
    >
      <span className={styles.readingProgressValue} />
    </div>
  );
}

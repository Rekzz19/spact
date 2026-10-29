"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type AnimatedTextProps = {
  words: readonly [string, ...string[]];
  intervalMs?: number;
};

export default function AnimatedText({
  words,
  intervalMs = 2800,
}: AnimatedTextProps) {
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const activeIndex = index % words.length;
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    const element = measureRef.current;
    if (!element) return;

    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [activeIndex, words]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;

    function updateAnimation() {
      clearInterval(timer);
      setReducedMotion(preference.matches);
      if (!preference.matches && words.length > 1) {
        timer = setInterval(
          () => setIndex((current) => (current + 1) % words.length),
          intervalMs,
        );
      }
    }

    updateAnimation();
    preference.addEventListener("change", updateAnimation);
    return () => {
      clearInterval(timer);
      preference.removeEventListener("change", updateAnimation);
    };
  }, [words.length, intervalMs]);

  return (
    <span
      style={{
        display: "inline-block",
        position: "relative",
        overflow: "hidden",
        verticalAlign: "bottom",
        color: "#2563eb",
        width,
        transition: reducedMotion
          ? "none"
          : "width 450ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <span className="sr-only">{words[0]}</span>
      <span
        ref={measureRef}
        aria-hidden="true"
        style={{
          display: "inline-block",
          visibility: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {words[activeIndex]}
      </span>
      {words.map((word, wordIndex) => {
        const active = wordIndex === activeIndex;
        const outgoing =
          wordIndex === (activeIndex + words.length - 1) % words.length;
        return (
          <span
            key={`${word}-${wordIndex}`}
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              whiteSpace: "nowrap",
              opacity: active ? 1 : 0,
              transform: `translateY(${active ? "0" : outgoing ? "-100%" : "100%"})`,
              transition: reducedMotion
                ? "none"
                : "transform 450ms cubic-bezier(0.22, 1, 0.36, 1), opacity 350ms ease",
            }}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
}

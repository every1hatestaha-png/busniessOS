"use client";

import { useEffect } from "react";

export function MarketingMotion() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section"));
    const cards = Array.from(document.querySelectorAll<HTMLElement>("main article"));

    if (reduce || !("IntersectionObserver" in window)) {
      [...sections, ...cards].forEach((node) => node.classList.add("is-visible"));
      return;
    }

    [...sections, ...cards].forEach((node) => node.classList.add("marketing-reveal-target"));
    sections.forEach((section) => {
      Array.from(section.querySelectorAll<HTMLElement>("article")).forEach((card, index) => {
        card.style.setProperty("--reveal-delay", `${Math.min(index * 55, 220)}ms`);
      });
    });

    root.classList.add("marketing-motion-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -7% 0px" },
    );

    [...sections, ...cards].forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      root.classList.remove("marketing-motion-ready");
    };
  }, []);

  return null;
}

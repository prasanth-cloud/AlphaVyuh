"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./landing.module.css";

function RegionToggle({
  region,
  onChange,
}: {
  region: "IN" | "US";
  onChange: (next: "IN" | "US") => void;
}) {
  return (
    <div className={styles.regionToggle} aria-label="Region selector">
      {(["IN", "US"] as const).map((option) => (
        <button
          key={option}
          className={`${styles.regionButton} ${region === option ? styles.regionButtonActive : ""}`}
          onClick={() => onChange(option)}
          type="button"
        >
          {option === "IN" ? "NSE" : "US"}
        </button>
      ))}
    </div>
  );
}

export default function LandingNav({ region }: { region: "IN" | "US" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleRegionChange = (next: "IN" | "US") => {
    document.cookie = `alphavyuh-region=${next}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  };

  return (
    <header className={`${styles.nav} ${scrolled ? styles.navScrolled : ""}`}>
      <div className={styles.navInner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>a</span>
          <span>alphavyuh</span>
        </Link>

        <nav className={`${styles.navLinks} ${menuOpen ? styles.navLinksOpen : ""}`}>
          <a href="#product">Product</a>
          <a href="#pricing">Pricing</a>
          <a href="#resources">Docs</a>
        </nav>

        <div className={styles.navActions}>
          <RegionToggle region={region} onChange={handleRegionChange} />
          <Link href="/login" className={styles.navGhostCta}>
            Sign in
          </Link>
          <Link href="/signup" className={styles.navPrimaryCta}>
            Start free
          </Link>
          <button
            type="button"
            className={styles.hamburger}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}

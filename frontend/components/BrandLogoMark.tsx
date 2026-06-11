interface BrandLogoMarkProps {
  className?: string;
  size?: number;
}

export function BrandLogoMark({ className = "brand-logo-mark", size = 36 }: BrandLogoMarkProps) {
  const iconSize = Math.round(size * 0.5);

  return (
    <div
      className={className}
      style={size === 36 ? undefined : { width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 18 18" fill="none" width={iconSize} height={iconSize}>
        <path
          d="M2 14L6.5 8L10 11L14.5 4L16 6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="6" r="1.5" fill="currentColor" />
      </svg>
    </div>
  );
}

"use client"

interface Props {
  size?: number
  variant?: "icon-only" | "full" | "full-white" | "company-only" | "stacked"
  className?: string
  showAppName?: boolean
}

export const BRAND = {
  company: "Vita Fresh",
  companyTag: "Fruit & Vegetable Distribution Network — Morocco",
  app: "Fresh Link Pro",
  tagline: "Gestion & Distribution Intelligente",
  poweredBy: "Powered by Vita tech",
  primaryGreen: "#1a4f2a",
  accentGold: "#b8962e",
  logoPath: "/vita-fresh-logo.png",
}

function VFIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <circle cx="50" cy="50" r="50" fill="#1a4d2e" />
      <path d="M28 40 L50 77 L72 40" fill="none" stroke="#ffffff" strokeWidth="11" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M53 32 C61 16,80 12,92 16 C86 34,66 40,53 32 Z" fill="#4ade80" />
      <path d="M59 29 C69 22,81 19,89 17" stroke="#1a4d2e" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export default function FreshLinkLogo({ size = 40, variant = "full", className = "", showAppName = true }: Props) {
  const logoSize = variant === "icon-only" ? size : Math.round(size * 1.1)

  const Logo = <VFIcon size={logoSize} />

  if (variant === "icon-only") {
    return <span className={`inline-block ${className}`}>{Logo}</span>
  }

  if (variant === "stacked") {
    return (
      <div className={`flex flex-col items-center gap-1.5 ${className}`}>
        <VFIcon size={size} />
        <div className="text-center leading-none">
          <div className="font-black tracking-tight" style={{ fontSize: size * 0.28, color: BRAND.primaryGreen }}>
            {BRAND.company}
          </div>
          <div className="font-semibold tracking-wide" style={{ fontSize: size * 0.13, color: BRAND.accentGold }}>
            {BRAND.companyTag}
          </div>
        </div>
      </div>
    )
  }

  if (variant === "company-only") {
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        {Logo}
        <div className="flex flex-col leading-none gap-0.5">
          <span className="font-black tracking-tight" style={{ fontSize: Math.round(size * 0.4), color: BRAND.primaryGreen, letterSpacing: "-0.01em" }}>
            {BRAND.company}
          </span>
          <span className="font-medium tracking-wide uppercase" style={{ fontSize: Math.round(size * 0.18), color: BRAND.accentGold }}>
            {BRAND.companyTag}
          </span>
        </div>
      </div>
    )
  }

  const isWhite = variant === "full-white"

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {Logo}
      <div className="flex flex-col leading-none gap-1">
        {showAppName && (
          <span
            className="font-extrabold tracking-tight"
            style={{ fontSize: Math.round(size * 0.38), color: isWhite ? "#ffffff" : BRAND.primaryGreen, letterSpacing: "-0.01em", lineHeight: 1.1 }}
          >
            Fresh{" "}
            <span style={{ color: isWhite ? "#86efac" : BRAND.accentGold }}>Link</span>{" "}
            <span style={{ color: isWhite ? "#4ade80" : BRAND.primaryGreen }}>Pro</span>
          </span>
        )}
        <span
          className="font-bold tracking-wide"
          style={{ fontSize: Math.round(size * 0.2), color: isWhite ? "rgba(255,255,255,0.65)" : BRAND.accentGold, letterSpacing: "0.04em", lineHeight: 1.2, textTransform: "uppercase" }}
        >
          {BRAND.company}
        </span>
      </div>
    </div>
  )
}

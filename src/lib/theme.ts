export const ACCENT_PRESETS = [
  { name: "Blue", value: "#6366f1" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Green", value: "#22c55e" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Yellow", value: "#eab308" },
];

const STANDARD_THEMES = ["dark", "light", "system"];

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

export function applyTheme(theme: string, accentColor?: string, bgImage?: string) {
  if (theme === "system") {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }

  const root = document.documentElement;
  if (accentColor && STANDARD_THEMES.includes(theme)) {
    root.style.setProperty("--color-primary", accentColor);
    root.style.setProperty("--color-ring", accentColor);
    root.style.setProperty("--color-sidebar-ring", accentColor);
    root.style.setProperty("--color-primary-foreground", isLightColor(accentColor) ? "#0a0a0a" : "#fafafa");
  } else {
    root.style.removeProperty("--color-primary");
    root.style.removeProperty("--color-ring");
    root.style.removeProperty("--color-sidebar-ring");
    root.style.removeProperty("--color-primary-foreground");
  }

  if (bgImage) {
    root.style.setProperty("--bg-image", `url("${bgImage}")`);
  } else {
    root.style.removeProperty("--bg-image");
  }
}

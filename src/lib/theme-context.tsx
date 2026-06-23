import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";

export type ThemeKey = "ocean" | "midnight" | "emerald" | "noir";
export type Mode = "light" | "dark";

export const THEMES: {
  key: ThemeKey;
  label: string;
  labelBn: string;
  swatch: string[];
}[] = [
  { key: "ocean",    label: "Ocean Deep",       labelBn: "ওশান ডিপ",           swatch: ["#0c2340", "#1a4a6e", "#2d8a9e", "#5cbdb9"] },
  { key: "midnight", label: "Midnight Indigo",  labelBn: "মিডনাইট ইন্ডিগো",   swatch: ["#0a0a1a", "#141432", "#1e1e5a", "#4f46e5"] },
  { key: "emerald",  label: "Emerald Prestige", labelBn: "এমেরাল্ড",            swatch: ["#064e3b", "#0d7a5f", "#c9a84c", "#f5f0e0"] },
  { key: "noir",     label: "Noir & Gold",      labelBn: "নোয়া অ্যান্ড গোল্ড", swatch: ["#0d0d0d", "#1a1a1a", "#c9a84c", "#f0d78c"] },
];

const STORAGE_KEY = "gv.theme";
const MODE_KEY    = "gv.mode";
const DEFAULT: ThemeKey = "ocean";
const DEFAULT_MODE: Mode = "dark";

// ✅ Fix #1 + #2: সঠিক validation, type-safe
function getSavedTheme(): ThemeKey {
  if (typeof localStorage === "undefined") return DEFAULT;
  const raw = localStorage.getItem(STORAGE_KEY);
  return THEMES.some((t) => t.key === raw) ? (raw as ThemeKey) : DEFAULT;
}

function getSavedMode(): Mode {
  if (typeof localStorage === "undefined") return DEFAULT_MODE;
  const raw = localStorage.getItem(MODE_KEY);
  return raw === "light" || raw === "dark" ? raw : DEFAULT_MODE;
}

type Ctx = {
  theme: ThemeKey;
  setTheme: (t: ThemeKey) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  toggleMode: () => void;
};

// ✅ Fix #6: default value-তে warning
const ThemeCtx = createContext<Ctx>({
  theme: DEFAULT,
  setTheme: () => { console.warn("[theme] setTheme called outside ThemeProvider"); },
  mode: DEFAULT_MODE,
  setMode: () => { console.warn("[theme] setMode called outside ThemeProvider"); },
  toggleMode: () => { console.warn("[theme] toggleMode called outside ThemeProvider"); },
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // ✅ Fix #2: initializer function — hydration flash দূর, useEffect লাগছে না
  const [theme, setThemeState] = useState<ThemeKey>(getSavedTheme);
  const [mode, setModeState]   = useState<Mode>(getSavedMode);

  // document attributes set — এটা রাখতে হবে (side effect)
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.classList.toggle("dark", mode === "dark");
    document.documentElement.classList.toggle("light", mode === "light");
  }, [theme, mode]);

  // ✅ Fix #3 + #4: useCallback + catch-এ warning
  const setTheme = useCallback((t: ThemeKey) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); }
    catch (e) { console.warn("[theme] localStorage error", e); }
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); }
    catch (e) { console.warn("[theme] localStorage error", e); }
  }, []);

  // ✅ Fix #5: stale closure দূর — functional updater ব্যবহার
  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try { localStorage.setItem(MODE_KEY, next); }
      catch (e) { console.warn("[theme] localStorage error", e); }
      return next;
    });
  }, []);

  // ✅ Fix #3: useMemo — object reference stable
  const value = useMemo(
    () => ({ theme, setTheme, mode, setMode, toggleMode }),
    [theme, setTheme, mode, setMode, toggleMode],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
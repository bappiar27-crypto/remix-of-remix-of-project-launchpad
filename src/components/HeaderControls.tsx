import { useEffect, useRef, useState } from "react";
import { Palette, Languages, Check, Sun, Moon } from "lucide-react";
import { THEMES, useTheme, type ThemeKey } from "@/lib/theme-context";
import { useI18n, type Lang } from "@/lib/i18n-context";

export function ModeToggle() {
  const { mode, toggleMode } = useTheme();
  return (
    <button
      onClick={toggleMode}
      title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle light/dark mode"
      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface/60 px-2.5 py-1.5 text-xs font-medium hover:bg-surface-elevated transition-all"
    >
      {mode === "dark" ? <Sun className="size-3.5 text-amber-400" /> : <Moon className="size-3.5 text-indigo-500" />}
      <span className="hidden sm:inline font-semibold uppercase">{mode === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}

function useClickOutside<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const { lang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const current = THEMES.find((x) => x.key === theme);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-surface/60 px-2.5 py-1.5 text-xs font-medium hover:bg-surface-elevated"
        aria-label={t("header.theme")}
      >
        <Palette className="size-3.5 text-primary" />
        <div className="hidden sm:flex items-center gap-1">
          {current?.swatch.slice(0, 4).map((c, i) => (
            <span key={i} className="size-2.5 rounded-full ring-1 ring-white/10" style={{ background: c }} />
          ))}
        </div>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-popover shadow-elevated p-2 z-50">
          <div className="px-2 py-1.5 text-[10px] tracking-[0.18em] uppercase text-muted-foreground font-semibold">
            {t("header.theme")}
          </div>
          {THEMES.map((th) => (
            <button
              key={th.key}
              onClick={() => { setTheme(th.key as ThemeKey); setOpen(false); }}
              className={`w-full flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface ${theme === th.key ? "bg-surface" : ""}`}
            >
              <div className="flex items-center gap-0.5">
                {th.swatch.map((c, i) => (
                  <span key={i} className="size-4 first:rounded-l-md last:rounded-r-md ring-1 ring-white/10" style={{ background: c }} />
                ))}
              </div>
              <span className="flex-1 text-left">{lang === "bn" ? th.labelBn : th.label}</span>
              {theme === th.key && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const options: { key: Lang; label: string }[] = [
    { key: "en", label: "English" },
    { key: "bn", label: "বাংলা" },
  ];
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface/60 px-2.5 py-1.5 text-xs font-medium hover:bg-surface-elevated"
        aria-label={t("header.language")}
      >
        <Languages className="size-3.5 text-primary" />
        <span className="font-semibold uppercase">{lang}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-40 rounded-xl border border-border bg-popover shadow-elevated p-1 z-50">
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => { setLang(o.key); setOpen(false); }}
              className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-surface ${lang === o.key ? "bg-surface" : ""}`}
            >
              <span>{o.label}</span>
              {lang === o.key && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

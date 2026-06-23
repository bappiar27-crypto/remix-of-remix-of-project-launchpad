import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";

// Bangladesh Standard Time = UTC+6 (no DST)
function formatBD(d: Date, lang: "en" | "bn") {
  try {
    const locale = lang === "bn" ? "bn-BD" : "en-GB";
    const timeStr = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "Asia/Dhaka",
    }).format(d);
    const dateStr = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Dhaka",
    }).format(d);
    return { timeStr, dateStr };
  } catch {
    return { timeStr: "--:--:--", dateStr: "" };
  }
}

export function LiveClock() {
  const { lang, t } = useI18n();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (isMounted) setNow(new Date());
    const id = setInterval(() => {
      if (isMounted) setNow(new Date());
    }, 1000);
    return () => {
      isMounted = false;
      clearInterval(id);
    };
  }, []);

  if (!now) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-border/60 bg-surface/60 px-2 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs">
        <Clock className="size-3 sm:size-3.5 text-primary" />
        <span className="font-mono tabular-nums text-muted-foreground">--:--:--</span>
      </div>
    );
  }

  const { timeStr, dateStr } = formatBD(now, lang);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2.5 rounded-lg border border-border/60 bg-surface/60 px-2 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs">
      <Clock className="size-3 sm:size-3.5 text-primary animate-pulse shrink-0" />
      <div className="leading-tight">
        <div className="font-mono tabular-nums font-semibold text-foreground">{timeStr}</div>
        <div className="text-[9px] sm:text-[10px] text-muted-foreground">
          {dateStr}
          <span className="hidden sm:inline"> · {t("time.bd")}</span>
        </div>
      </div>
    </div>
  );
}

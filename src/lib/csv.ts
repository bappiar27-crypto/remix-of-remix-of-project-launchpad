// Client-safe CSV helpers.
export function toCsv(rows: Record<string, any>[], columns?: string[]): string {
  if (!rows.length) return columns ? columns.join(",") : "";
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string): boolean {
  try {
    if (!csv || csv.length === 0) {
      console.warn("[CSV] Empty data provided");
      return false;
    }

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    if (blob.size === 0) {
      console.error("[CSV] Blob creation failed - size is 0");
      return false;
    }

    const url = URL.createObjectURL(blob);
    if (!url) {
      console.error("[CSV] Failed to create object URL");
      return false;
    }

    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "export.csv";

    try {
      document.body.appendChild(a);
      a.click();
    } finally {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    return true;
  } catch (error) {
    console.error("[CSV] Download failed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

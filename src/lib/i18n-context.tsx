import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";

export type Lang = "en" | "bn";

const STORAGE_KEY = "gv.lang";

const DICT: Record<string, { en: string; bn: string }> = {
  // Brand
  "brand.tagline":       { en: "Command Center",              bn: "কমান্ড সেন্টার" },
  // Sidebar groups
  "nav.main":            { en: "Main",                        bn: "প্রধান" },
  "nav.management":      { en: "Management",                  bn: "ম্যানেজমেন্ট" },
  "nav.system":          { en: "System",                      bn: "সিস্টেম" },
  // Sidebar items
  "nav.dashboard":       { en: "Dashboard",                   bn: "ড্যাশবোর্ড" },
  "nav.campaigns":       { en: "Campaigns",                   bn: "ক্যাম্পেইন" },
  "nav.adsets":          { en: "Ad Sets",                     bn: "অ্যাড সেট" },
  "nav.ads":             { en: "Ads",                         bn: "বিজ্ঞাপন" },
  "nav.insights":        { en: "Insights",                    bn: "ইনসাইটস" },
  "nav.clients":         { en: "Clients",                     bn: "ক্লায়েন্ট" },
  "nav.reports":         { en: "Reports",                     bn: "রিপোর্ট" },
  "nav.budget":          { en: "Budget Tracker",              bn: "বাজেট ট্র্যাকার" },
  "nav.alerts":          { en: "Alerts",                      bn: "অ্যালার্ট" },
  "nav.sync":            { en: "Sync Activity",               bn: "সিঙ্ক অ্যাক্টিভিটি" },
  "nav.fbapi":           { en: "Facebook Marketing API",      bn: "ফেসবুক মার্কেটিং API" },
  "nav.settings":        { en: "Settings",                    bn: "সেটিংস" },
  // Header
  "header.newClient":    { en: "New Client",                  bn: "নতুন ক্লায়েন্ট" },
  "header.logout":       { en: "Logout",                      bn: "লগ আউট" },
  "header.theme":        { en: "Theme",                       bn: "থিম" },
  "header.language":     { en: "Language",                    bn: "ভাষা" },
  // Status
  "status.checking":     { en: "Checking...",                 bn: "চেক করা হচ্ছে..." },
  "status.noAccounts":   { en: "No accounts connected",       bn: "কোনো অ্যাকাউন্ট সংযুক্ত নয়" },
  "status.live":         { en: "live",                        bn: "লাইভ" },
  "role.admin":          { en: "Super Admin",                 bn: "সুপার অ্যাডমিন" },
  "role.member":         { en: "Member",                      bn: "সদস্য" },
  "user.default":        { en: "User",                        bn: "ইউজার" },
  // Time
  "time.bd":             { en: "Dhaka",                       bn: "ঢাকা" },
  // Portal
  "portal.tagline":      { en: "Live Ads Dashboard",          bn: "লাইভ অ্যাড ড্যাশবোর্ড" },
  "portal.welcome":      { en: "Welcome",                     bn: "স্বাগতম" },
  "portal.subtitle":     { en: "Real-time Facebook Ads performance for", bn: "রিয়েল-টাইম ফেসবুক অ্যাডস পারফরম্যান্স —" },
  "portal.accounts":     { en: "ad account(s)",               bn: "অ্যাড অ্যাকাউন্ট" },
  "portal.liveStatus":   { en: "Live Status & Alerts",        bn: "লাইভ স্ট্যাটাস ও অ্যালার্ট" },
  "portal.liveAuto":     { en: "Live · auto-refresh",         bn: "লাইভ · অটো-রিফ্রেশ" },
  "portal.refresh":      { en: "Refresh",                     bn: "রিফ্রেশ" },
  "portal.totalSpend":   { en: "Total Spend",                 bn: "মোট খরচ" },
  "portal.reach":        { en: "Reach",                       bn: "রিচ" },
  "portal.impressions":  { en: "Impressions",                 bn: "ইম্প্রেশন" },
  "portal.clicks":       { en: "Clicks",                      bn: "ক্লিক" },
  "portal.results":      { en: "Results",                     bn: "রেজাল্ট" },
  "portal.activeCamps":  { en: "Active Campaigns",            bn: "চলমান ক্যাম্পেইন" },
  "portal.ctr":          { en: "CTR",                         bn: "সিটিআর" },
  "portal.costPerResult":{ en: "Cost / Result",               bn: "প্রতি রেজাল্টে খরচ" },
  "portal.budgetPace":   { en: "Budget pacing & forecast",    bn: "বাজেট পেসিং ও পূর্বাভাস" },
  "portal.avgDaily":     { en: "Avg daily spend (7d)",        bn: "গড় দৈনিক খরচ (৭ দিন)" },
  "portal.weeklyProj":   { en: "Weekly projection",           bn: "সাপ্তাহিক পূর্বাভাস" },
  "portal.monthProj":    { en: "Month-end projection",        bn: "মাস শেষের পূর্বাভাস" },
  "portal.perf30":       { en: "Performance — last 30 days",  bn: "পারফরম্যান্স — শেষ ৩০ দিন" },
  "portal.topCamps":     { en: "Top campaigns",               bn: "সেরা ক্যাম্পেইন" },
  "portal.export":       { en: "Export",                      bn: "এক্সপোর্ট" },
  "portal.poweredBy":    { en: "Powered by",                  bn: "পরিচালিত —" },
  "portal.lastSync":     { en: "Last sync",                   bn: "শেষ সিঙ্ক" },
  "portal.campaign":     { en: "Campaign",                    bn: "ক্যাম্পেইন" },
  "portal.status":       { en: "Status",                      bn: "স্ট্যাটাস" },
  "portal.spend":        { en: "Spend",                       bn: "খরচ" },
  "portal.noCamps":      { en: "No campaigns yet — sync in progress.", bn: "এখনো কোনো ক্যাম্পেইন নেই — সিঙ্ক চলছে।" },
  "portal.print":        { en: "Print",                       bn: "প্রিন্ট" },
  "portal.autoUpdated":  { en: "Data updated automatically",  bn: "ডেটা স্বয়ংক্রিয়ভাবে আপডেট হচ্ছে" },
  // Common actions
  "action.save":         { en: "Save",                        bn: "সংরক্ষণ" },
  "action.cancel":       { en: "Cancel",                      bn: "বাতিল" },
  "action.delete":       { en: "Delete",                      bn: "ডিলিট" },
  "action.edit":         { en: "Edit",                        bn: "এডিট" },
  "action.create":       { en: "Create",                      bn: "তৈরি করুন" },
  "action.search":       { en: "Search",                      bn: "অনুসন্ধান" },
  "action.filter":       { en: "Filter",                      bn: "ফিল্টার" },
  "action.export":       { en: "Export",                      bn: "এক্সপোর্ট" },
  "action.refresh":      { en: "Refresh",                     bn: "রিফ্রেশ" },
  "action.loading":      { en: "Loading...",                  bn: "লোড হচ্ছে..." },
  "action.viewAll":      { en: "View all",                    bn: "সব দেখুন" },
  "action.back":         { en: "Back",                        bn: "ফিরে যান" },
  "action.next":         { en: "Next",                        bn: "পরবর্তী" },
  "action.submit":       { en: "Submit",                      bn: "জমা দিন" },
  "common.total":        { en: "Total",                       bn: "মোট" },
  "common.active":       { en: "Active",                      bn: "সক্রিয়" },
  "common.paused":       { en: "Paused",                      bn: "বন্ধ" },
  "common.name":         { en: "Name",                        bn: "নাম" },
  "common.email":        { en: "Email",                       bn: "ইমেইল" },
  "common.password":     { en: "Password",                    bn: "পাসওয়ার্ড" },
  "common.status":       { en: "Status",                      bn: "স্ট্যাটাস" },
  "common.actions":      { en: "Actions",                     bn: "অ্যাকশন" },
  "common.today":        { en: "Today",                       bn: "আজ" },
  "common.yesterday":    { en: "Yesterday",                   bn: "গতকাল" },
  "common.last7":        { en: "Last 7 days",                 bn: "শেষ ৭ দিন" },
  "common.last30":       { en: "Last 30 days",                bn: "শেষ ৩০ দিন" },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };

// ✅ Fix: default setLang-এ warning
const I18nCtx = createContext<Ctx>({
  lang: "en",
  setLang: () => { console.warn("[i18n] setLang called outside I18nProvider"); },
  t: (k) => k,
});

// ✅ Fix #1 + #2: সঠিক type validation, hydration flash দূর
function getSavedLang(): Lang {
  if (typeof localStorage === "undefined") return "en";
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "en" || raw === "bn" ? raw : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // ✅ Fix #2: initializer function দিয়ে — useEffect আর লাগছে না
  const [lang, setLangState] = useState<Lang>(getSavedLang);

  // document lang attribute set (এটা রাখা হয়েছে — ভালো practice)
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", lang);
    }
  }, [lang]);

  // ✅ Fix #3: useCallback — stable reference
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch (e) {
      // ✅ Fix #4: empty catch বাদ — warning দেখাবে
      console.warn("[i18n] localStorage not available", e);
    }
  }, []);

  // ✅ Fix #3: useCallback — lang change হলেই নতুন function
  const t = useCallback(
    (key: string) => {
      if (process.env.NODE_ENV === "development" && !DICT[key]) {
        console.warn(`[i18n] Missing translation key: "${key}"`);
      }
      return DICT[key]?.[lang] ?? key;
    },
    [lang],
  );

  // ✅ Fix #3: useMemo — object reference stable রাখা
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
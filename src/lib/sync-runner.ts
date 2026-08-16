// Client-side sync orchestrator.
//
// WHY THIS EXISTS
// A Cloudflare Worker invocation has a hard cap on outgoing subrequests
// ("Too many subrequests by single Worker invocation"). Syncing one ad account
// costs ~25-30 subrequests (Facebook Graph + database), so syncing every
// account inside ONE server call blew the cap and every account after the
// first one or two failed.
//
// The server therefore syncs a capped number of accounts per call and returns
// the accounts still pending. This helper walks that pending list sequentially,
// issuing ONE server call per account — each account gets its own fresh
// subrequest budget.

export type SyncAccountResult = {
  id: string;
  ok: boolean;
  error?: string | null;
  account_name?: string | null;
};

type PendingAccount = { id: string; account_name?: string | null };

type SyncAllResponse = {
  skipped?: boolean;
  tokenHealth?: { error?: string | null } | null;
  results?: SyncAccountResult[];
  pending?: PendingAccount[];
  remaining?: number;
};

export type RunFullSyncOptions = {
  /** `useServerFn(syncAllAccountsNow)` */
  syncAllFn: (args: { data?: { maxAccounts?: number } }) => Promise<any>;
  /** `useServerFn(syncOneAccount)` */
  syncOneFn: (args: { data: { id: string } }) => Promise<any>;
  /** Called after every account so the UI can show progress. */
  onProgress?: (done: number, total: number, accountName?: string | null) => void;
  /** Safety stop so a broken pending list can never loop forever. */
  maxAccounts?: number;
};

export type RunFullSyncResult = {
  skipped: boolean;
  tokenHealth?: { error?: string | null } | null;
  results: SyncAccountResult[];
};

export async function runFullSync({
  syncAllFn,
  syncOneFn,
  onProgress,
  maxAccounts = 100,
}: RunFullSyncOptions): Promise<RunFullSyncResult> {
  const first: SyncAllResponse = await syncAllFn({ data: undefined });

  if (first?.skipped) {
    return { skipped: true, tokenHealth: first.tokenHealth ?? null, results: [] };
  }

  const results: SyncAccountResult[] = [...(first.results ?? [])];
  const pending = (first.pending ?? []).slice(0, Math.max(0, maxAccounts - results.length));
  const total = results.length + pending.length;

  onProgress?.(results.length, total, null);

  for (const account of pending) {
    try {
      const r = await syncOneFn({ data: { id: account.id } });
      results.push({
        id: account.id,
        ok: !!r?.ok,
        error: r?.error ?? null,
        account_name: account.account_name ?? null,
      });
    } catch (e) {
      results.push({
        id: account.id,
        ok: false,
        error: e instanceof Error ? e.message : "sync failed",
        account_name: account.account_name ?? null,
      });
    }
    onProgress?.(results.length, total, account.account_name ?? null);
  }

  return { skipped: false, tokenHealth: first.tokenHealth ?? null, results };
}

/** Human-readable summary used by the dashboard / sync activity toasts. */
export function summarizeSync(results: SyncAccountResult[]) {
  const failed = results.filter((r) => r && r.ok === false);
  return {
    total: results.length,
    okCount: results.length - failed.length,
    failed,
    firstError: failed[0]
      ? `"${failed[0].account_name ?? failed[0].id}": ${failed[0].error ?? "unknown"}`
      : null,
  };
}

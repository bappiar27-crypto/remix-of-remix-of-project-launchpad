import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listPendingUsers,
  approveUser,
  rejectUser,
} from "@/lib/approvals.functions";
import { adminListBlockedIps, adminUnblockIp } from "@/lib/login-guard.functions";
import { toast } from "sonner";
import { Loader2, Check, X, ShieldCheck, ShieldX, Clock, Ban, Unlock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-approvals")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (!roles?.some((r) => r.role === "admin")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "User Approvals — Admin" }] }),
  component: ApprovalsPage,
});

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
};

function StatusBadge({ status }: { status: Row["approval_status"] }) {
  const map = {
    pending: { cls: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300", icon: Clock, label: "Pending" },
    approved: { cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", icon: ShieldCheck, label: "Approved" },
    rejected: { cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300", icon: ShieldX, label: "Rejected" },
  } as const;
  const { cls, icon: Icon, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <Icon className="size-3" />
      {label}
    </span>
  );
}

function ApprovalsPage() {
  const list = useServerFn(listPendingUsers);
  const approve = useServerFn(approveUser);
  const reject = useServerFn(rejectUser);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  const q = useQuery({
    queryKey: ["admin-approvals"],
    queryFn: () => list({ data: undefined as any }) as Promise<Row[]>,
  });

  const approveMut = useMutation({
    mutationFn: (userId: string) => approve({ data: { userId } }),
    onSuccess: () => {
      toast.success("User approved");
      qc.invalidateQueries({ queryKey: ["admin-approvals"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Approve failed"),
  });

  const rejectMut = useMutation({
    mutationFn: (userId: string) => reject({ data: { userId } }),
    onSuccess: () => {
      toast.success("User rejected");
      qc.invalidateQueries({ queryKey: ["admin-approvals"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reject failed"),
  });

  const rows = (q.data ?? []).filter((r) => filter === "all" || r.approval_status === filter);
  const counts = (q.data ?? []).reduce(
    (acc, r) => {
      acc[r.approval_status]++;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0 } as Record<string, number>,
  );

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">User Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          New sign-ups stay locked out until you approve them here.
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition ${
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface hover:bg-surface-elevated border-border"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && (
              <span className="ml-1.5 text-xs opacity-70">({counts[f] ?? 0})</span>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {q.isLoading ? (
          <div className="p-12 flex justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No users in this view.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Signed up</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{r.full_name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.email || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.approval_status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {r.approval_status !== "approved" && (
                        <button
                          onClick={() => approveMut.mutate(r.id)}
                          disabled={approveMut.isPending}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                        >
                          <Check className="size-3.5" /> Approve
                        </button>
                      )}
                      {r.approval_status !== "rejected" && (
                        <button
                          onClick={() => rejectMut.mutate(r.id)}
                          disabled={rejectMut.isPending}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25 disabled:opacity-50"
                        >
                          <X className="size-3.5" /> Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <BlockedIpsPanel />
    </div>
  );
}

function BlockedIpsPanel() {
  const listIps = useServerFn(adminListBlockedIps);
  const unblock = useServerFn(adminUnblockIp);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-blocked-ips"],
    queryFn: () => listIps({ data: undefined as any }) as Promise<Array<{ ip: string; failures: number; lastEmail: string | null; lastAt: string; blocked: boolean }>>,
  });
  const unblockMut = useMutation({
    mutationFn: (ip: string) => unblock({ data: { ip } }),
    onSuccess: () => {
      toast.success("IP unblocked");
      qc.invalidateQueries({ queryKey: ["admin-blocked-ips"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Unblock failed"),
  });
  const rows = q.data ?? [];
  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center gap-2">
        <Ban className="size-4" />
        <h2 className="text-lg font-semibold">Login Attempts & Blocked IPs</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        An IP is automatically blocked after 2 failed sign-in attempts.
      </p>
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 flex justify-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No login attempts recorded.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">IP Address</th>
                <th className="text-left px-4 py-3 font-medium">Failures</th>
                <th className="text-left px-4 py-3 font-medium">Last email</th>
                <th className="text-left px-4 py-3 font-medium">Last attempt</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ip} className="border-t border-border">
                  <td className="px-4 py-3 font-mono">{r.ip}</td>
                  <td className="px-4 py-3">{r.failures}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.lastEmail || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(r.lastAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {r.blocked ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-300">
                        <Ban className="size-3" /> Blocked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        <ShieldCheck className="size-3" /> OK
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        onClick={() => unblockMut.mutate(r.ip)}
                        disabled={unblockMut.isPending}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50"
                      >
                        <Unlock className="size-3.5" /> Unblock / clear
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

"use client";

// ============================================================================
// TRIP COLLABORATION — ISSUE #4 §13 (val 2): vloga, vabila, revokacija,
// javna/zasebna povezava + preimenovanje s compare-and-swap.
// ============================================================================
// Nahaja se na /pot/[shareId] (SL-only površina, enako kot SharedTrip).
//
// KAJ se izriše (nič ne moti običajnega obiskovalca javne pote):
//   - ?invite={token} → trak vabila (prijavljenim gumb Sprejmi, neprijavljenim
//     povezava na prijavo — iskreno, vloga se razkrije ŠELE ob sprejemu);
//   - vloga OWNER  → upravljanje sodelujočih (vabila/vloge/odvzem),
//     preklop javne povezave, preimenovanje (CAS);
//   - vloga EDITOR → preimenovanje (CAS);
//   - vloga VIEWER / anonimni obiskovalec javne pote → NIČ (čisto).
//
// ISKRENOST: vsaka napaka API-ja se izpiše (brez tihih padcev); konflikt
// preimenovanja (409) pove, da je nekdo drug posodobil pot, in ponudi
// osvežitev; SMTP ni nastavljen → vabilo se kopira ročno (povedano).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Users,
  Link2,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  UserPlus,
  ShieldCheck,
  RefreshCw,
  History,
} from "lucide-react";
import {
  getEditToken,
  fetchTripRevisions,
  fetchTripRevisionContent,
  updateItinerary,
  type RevisionMeta,
} from "@/lib/itinerary-share";
import {
  addSavedTrip,
  deriveSavedTripName,
} from "@/lib/my-trips-storage";

type Role = "OWNER" | "EDITOR" | "COMMENTER" | "VIEWER" | "NONE";

interface CollaboratorRow {
  id: string;
  role: string;
  status: string;
  inviteEmail: string | null;
  userId: string | null;
  invitedBy: string;
  createdAt: string;
  acceptedAt: string | null;
  accountEmail: string | null;
  accountName: string | null;
}

interface TripAggregate {
  success: boolean;
  shareId: string;
  role: Role;
  isPublic: boolean;
  name: string | null;
  version: { contentVersion: number; updatedAt: string };
  collaborators?: CollaboratorRow[];
}

// ISSUE #24 Sklop 1 (1.164.0): L-vzorec {sl,en} — prej SL-only
// TASK 8 / F3-B: placeholder nalaganja zgodovine verzij v L-pattern (SL/EN —
// D8-A §13 „Nalagam…" uhodi so trdi predpogoj za F3-E EN razširitev).
const L = {
  loadingRevisions: { sl: "Nalagam zgodovino …", en: "Loading history …" },
  httpError: {
    sl: (status: number) => `Napaka ${status}`,
    en: (status: number) => `Error ${status}`,
  },
  collabUnavailable: {
    sl: (err: string) => `Sodelovanje trenutno ni na voljo: ${err}`,
    en: (err: string) => `Collaboration is currently unavailable: ${err}`,
  },
  copyFailed: {
    sl: "Kopiranje ni uspelo — povezavo prepiši ročno.",
    en: "Copy failed — please copy the link manually.",
  },
  // Vloge/statusi sodelujočih (Record — indeksira se z dinamiko strežnika).
  roleLabels: {
    sl: {
      OWNER: "Lastnik",
      EDITOR: "Urednik",
      COMMENTER: "Komentator",
      VIEWER: "Gledalec",
    } as Record<string, string>,
    en: {
      OWNER: "Owner",
      EDITOR: "Editor",
      COMMENTER: "Commenter",
      VIEWER: "Viewer",
    } as Record<string, string>,
  },
  statusLabels: {
    sl: {
      PENDING: "čaka sprejem",
      ACTIVE: "aktiven",
      REVOKED: "odvzet",
    } as Record<string, string>,
    en: {
      PENDING: "pending acceptance",
      ACTIVE: "active",
      REVOKED: "revoked",
    } as Record<string, string>,
  },
  inviteBannerTitle: {
    sl: "Povabljen si k sodelovanju na tej poti",
    en: "You're invited to collaborate on this trip",
  },
  inviteAcceptedPrefix: {
    sl: "Vabilo sprejeto — tvoja vloga:",
    en: "Invitation accepted — your role:",
  },
  inviteLoginPrefix: {
    sl: "Za sprejem vabila se prijavi z računom popotnika — vloga na poti je vezana na račun,",
    en: "To accept the invitation, sign in with a traveller account — the role on this trip is tied to your account,",
  },
  inviteLoginLink: { sl: "prijavi se", en: "sign in" },
  acceptInvite: { sl: "Sprejmi vabilo", en: "Accept invitation" },
  inviteRoleHint: {
    sl: "Vloga se razkrije po sprejemu (klik na povezavo še ni sprejem).",
    en: "The role is revealed once you accept (opening the link is not acceptance yet).",
  },
  sectionTitle: { sl: "Sodelovanje na poti", en: "Trip collaboration" },
  privateLinkBadge: { sl: "Zasebna povezava", en: "Private link" },
  nameLabel: { sl: "Ime poti", en: "Trip name" },
  namePlaceholder: { sl: "Poletje na Bledu", en: "Summer at Lake Bled" },
  saveName: { sl: "Shrani ime", en: "Save name" },
  nameSaved: {
    sl: (v: number) => `Ime shranjeno (različica ${v}).`,
    en: (v: number) => `Name saved (version ${v}).`,
  },
  renameConflictPrefix: {
    sl: "Pot je med tem spremenil nekdo drug (sočasno urejanje) —",
    en: "Someone else changed the trip in the meantime (concurrent editing) —",
  },
  refresh: { sl: "osveži", en: "refresh" },
  conflictSuffix: { sl: "in poskusi znova.", en: "and try again." },
  casNote: {
    sl: "Zaporedno urejanje je zaklenjeno z različico (iskren 409 ob konfliktu — nikoli tiho ne prepišemo tučih sprememb).",
    en: "Sequential editing is version-locked (an honest 409 on conflict — we never silently overwrite someone else's changes).",
  },
  versionHistory: { sl: "Zgodovina verzij", en: "Version history" },
  hide: { sl: "skrij", en: "hide" },
  show: { sl: "pokaži", en: "show" },
  tryAgain: { sl: "poskusi znova", en: "try again" },
  noOlderRevisions: {
    sl: (v: number) =>
      `Še ni starejših različic — ta pot še ni bila urejena (trenutna v${v} je prva).`,
    en: (v: number) =>
      `No older versions yet — this trip has not been edited yet (current v${v} is the first).`,
  },
  restore: { sl: "Obnovi", en: "Restore" },
  restoredNote: {
    sl: "Obnovljeno — osvežujem pot…",
    en: "Restored — refreshing the trip…",
  },
  restoreConflictPrefix: {
    sl: "Pot je med tem spremenil nekdo drug —",
    en: "Someone else changed the trip in the meantime —",
  },
  restoreNote: {
    sl: "Obnovitev vrne staro vsebino kot NOVO različico (zdajšnja se arhivira) — zgodovina se nikoli ne izgubi. Zadnjih 20 različic se hrani.",
    en: "Restoring brings the old content back as a NEW version (the current one is archived) — history is never lost. The last 20 versions are kept.",
  },
  inviteSectionTitle: { sl: "Povabi sodelujočega", en: "Invite a collaborator" },
  roleLabel: { sl: "Vloga", en: "Role" },
  roleEditorDesc: {
    sl: "Urednik — ureja vsebino in ime",
    en: "Editor — edits content and name",
  },
  roleCommenterDesc: {
    sl: "Komentator — glasovi, komentarji, ankete, dnevnik",
    en: "Commenter — votes, comments, polls, diary",
  },
  roleViewerDesc: {
    sl: "Gledalec — vidi zasebno pot",
    en: "Viewer — sees the private trip",
  },
  emailLabel: {
    sl: "E-pošta (opcijsko — žeton se veže nanjo)",
    en: "Email (optional — the token is bound to it)",
  },
  emailPlaceholder: { sl: "priatelj@primer.si", en: "friend@example.com" },
  issueInvite: { sl: "Izdaj vabilo", en: "Create invitation" },
  inviteLinkTitle: {
    sl: "Povezava vabila (ročno deli):",
    en: "Invitation link (share manually):",
  },
  copied: { sl: "Skopirano", en: "Copied" },
  copy: { sl: "Kopiraj", en: "Copy" },
  collaboratorsTitle: { sl: "Sodelujoči", en: "Collaborators" },
  noCollaborators: {
    sl: (own: string) =>
      `Še nihče ni povabljen — ta pot je tvoja (lastništvo: žeton tega brskalnika ${own}).`,
    en: (own: string) =>
      `No one has been invited yet — this trip is yours (ownership: this browser's token ${own}).`,
  },
  ownershipAccount: { sl: "+ tvoj račun", en: "+ your account" },
  ownershipClaim: {
    sl: "ali račun po prevzemu",
    en: "or the account after claiming",
  },
  inviteeNoEmail: {
    sl: "Povabljeni brez e-pošte",
    en: "Invitee without an email",
  },
  acceptedOn: {
    sl: (d: string) => ` · sprejel ${d}`,
    en: (d: string) => ` · accepted ${d}`,
  },
  invitedOn: {
    sl: (d: string) => ` · povabljen ${d}`,
    en: (d: string) => ` · invited ${d}`,
  },
  changeRoleAria: { sl: "Spremeni vlogo", en: "Change role" },
  revokeAccess: { sl: "Odvzemi", en: "Revoke access" },
  accessRevoked: { sl: "dostop odvzet", en: "access revoked" },
  inviteAgain: { sl: "Povabi znova", en: "Invite again" },
  publicLinkTitle: { sl: "Javna deljena povezava", en: "Public share link" },
  publicLinkDesc: {
    sl: "Izklopljena povezava pomeni: pot vidijo samo prijavljeni sodelujoči (ostali vidijo 404). Anonimni lastnik ne more izklopiti (žeton živi v brskalniku — zaklep).",
    en: "When the link is off, only signed-in collaborators can see the trip (everyone else sees a 404). An anonymous owner cannot turn it off (the token lives in the browser — lock-in).",
  },
  publicLinkAria: { sl: "Javna povezava", en: "Public link" },
} as const;

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

async function apiJson(
  url: string,
  init: RequestInit & { editToken?: string | null }
): Promise<Response> {
  const { editToken, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (editToken) headers.set("x-dsa-edit-token", editToken);
  if (rest.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(url, { ...rest, headers });
}

export function TripCollaboration({
  shareId,
  initialName,
}: {
  shareId: string;
  initialName: string | null;
}) {
  const { data: session, status: sessionStatus } = useSession();
  // TASK 8 / F3-B: jezik za L-pattern placeholder nalaganja zgodovine
  // verzij (SL privzeto — predpogoj za F3-E).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  // ISSUE #24 Sklop 1 (1.164.0): datumi {sl,en} — SL ostaja sl-SI.
  const dateLocale = lang === "en" ? "en-GB" : "sl-SI";
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [agg, setAgg] = useState<TripAggregate | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Vabilo
  const [inviteState, setInviteState] = useState<
    "idle" | "accepting" | "accepted" | "error"
  >("idle");
  const [acceptedRole, setAcceptedRole] = useState<string | null>(null);

  // Upravljanje (lastnik)
  const [inviteRole, setInviteRole] = useState<string>("EDITOR");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Preimenovanje (CAS)
  const [nameDraft, setNameDraft] = useState(initialName ?? "");
  const [renameState, setRenameState] = useState<"idle" | "saving" | "saved" | "conflict">(
    "idle"
  );
  const nameRef = useRef(initialName ?? "");

  // ISSUE #4 §22 (val 5): zgodovina revizij vsebine (undo na strežniku).
  // Leneno — naloži se šele ob razpretju (urejevalška površina).
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisions, setRevisions] = useState<RevisionMeta[] | null>(null);
  const [revisionsError, setRevisionsError] = useState<string | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [restoreState, setRestoreState] = useState<
    "idle" | "done" | "conflict" | "error"
  >("idle");

  const editToken = useMemo(
    () => (typeof window === "undefined" ? null : getEditToken(shareId)),
    [shareId]
  );

  const load = useCallback(async () => {
    try {
      const r = await apiJson(`/api/trip/${encodeURIComponent(shareId)}`, {
        editToken,
      });
      if (!r.ok) {
        // 404 = zasebna pot brez vloge → tiho skrijemo panel (trak vabila
        // ostane — povabljeni še ni sprejel).
        setAgg(null);
        setLoadError(r.status === 404 ? null : L.httpError[lang](r.status));
        return;
      }
      const data = (await r.json()) as TripAggregate;
      setAgg(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(errText(e));
    }
  }, [shareId, editToken, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── SPREJEM VABILA ────────────────────────────────────────────────────
  const acceptInvite = useCallback(async () => {
    if (!inviteToken) return;
    setInviteState("accepting");
    setActionError(null);
    try {
      const r = await fetch("/api/trip/collaborators/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteToken }),
      });
      const data = (await r.json()) as {
        success?: boolean;
        role?: string;
        error?: string;
        alreadyActive?: boolean;
        note?: string;
      };
      if (!r.ok || !data.success) {
        setInviteState("error");
        setActionError(data.error ?? L.httpError[lang](r.status));
        return;
      }
      setInviteState("accepted");
      setAcceptedRole(data.role ?? null);
      if (data.note) setActionError(data.note);
      // Osveži agregat (nova vloga).
      void load();
    } catch (e) {
      setInviteState("error");
      setActionError(errText(e));
    }
  }, [inviteToken, load, lang]);

  // ── IZDAJA VABILA (lastnik) ───────────────────────────────────────────
  const issueInvite = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    setInviteUrl(null);
    setInviteNote(null);
    try {
      const r = await apiJson(
        `/api/trip/${encodeURIComponent(shareId)}/collaborators`,
        {
          method: "POST",
          editToken,
          body: JSON.stringify({
            role: inviteRole,
            ...(inviteEmail.trim()
              ? { inviteEmail: inviteEmail.trim() }
              : {}),
          }),
        }
      );
      const data = (await r.json()) as {
        success?: boolean;
        inviteUrl?: string;
        emailHint?: string;
        error?: string;
      };
      if (!r.ok || !data.success) {
        setActionError(data.error ?? L.httpError[lang](r.status));
        return;
      }
      setInviteUrl(data.inviteUrl ?? null);
      setInviteNote(data.emailHint ?? null);
      void load();
    } catch (e) {
      setActionError(errText(e));
    } finally {
      setBusy(false);
    }
  }, [shareId, editToken, inviteRole, inviteEmail, load, lang]);

  // ── SPREMENBA VLOGE / ODVZEM (lastnik) ────────────────────────────────
  const patchCollaborator = useCallback(
    async (id: string, patch: { role?: string; status?: string }) => {
      setBusy(true);
      setActionError(null);
      try {
        const r = await apiJson(
          `/api/trip/${encodeURIComponent(shareId)}/collaborators`,
          { method: "PATCH", editToken, body: JSON.stringify({ id, ...patch }) }
        );
        const data = (await r.json()) as { success?: boolean; error?: string };
        if (!r.ok || !data.success) {
          setActionError(data.error ?? L.httpError[lang](r.status));
          return;
        }
        void load();
      } catch (e) {
        setActionError(errText(e));
      } finally {
        setBusy(false);
      }
    },
    [shareId, editToken, load, lang]
  );

  // ── ZGODOVINA REVIZIJ (§22, leneco nalaganje) ─────────────────────────
  const loadRevisions = useCallback(async () => {
    setRevisionsError(null);
    try {
      const r = await fetchTripRevisions(shareId);
      setRevisions(r.revisions);
    } catch (e) {
      setRevisionsError(errText(e));
    }
  }, [shareId]);

  const toggleRevisions = useCallback(() => {
    setRevisionsOpen((open) => {
      const next = !open;
      // Leneco: prvo razprtje sproži nalaganje (ne ob vsakem renderju).
      if (next && revisions === null && !revisionsError) {
        void loadRevisions();
      }
      return next;
    });
  }, [revisions, revisionsError, loadRevisions]);

  // §22: OBNOVI revizijo = PATCH s prebrano staro vsebino (CAS). Sam
  // obnovitveni zapis NAREDI revizijo trenutne vsebine — zgodovina ostane
  // celotna (obnovitev je tudi urejanje, sledenje se ne prekine).
  const restoreVersion = useCallback(
    async (version: number) => {
      if (!agg || restoringVersion !== null) return;
      setRestoreState("idle");
      setRestoringVersion(version);
      setActionError(null);
      try {
        const content = await fetchTripRevisionContent(shareId, version);
        const upd = await updateItinerary(
          shareId,
          content,
          agg.version.contentVersion
        );
        // 1.163.2 (#22 REMAINING): uspešna obnovitev (CAS posodobitev) je
        // TUDI shranjevanje — zapiši/osveži vnos v Moja potovanja, da je
        // pot pošteno vidna tudi po zamenjavi naprave/brskalnika in ni
        // izpuščena iz prevzema ob prijavi (strežniško ime je kanon,
        // fallback iz destinacij).
        addSavedTrip(shareId, upd.name ?? deriveSavedTripName(content));
        setRestoreState("done");
        // RSC stran /pot/[shareId] — celotna osvežitev pobere svežo
        // vsebino + novo verzijo (pošteno in preprosto).
        setTimeout(() => window.location.reload(), 900);
      } catch (e) {
        const msg = errText(e);
        if (msg.includes("sočasno urejanje")) {
          setRestoreState("conflict");
        } else {
          setRestoreState("error");
          setActionError(msg);
        }
      } finally {
        setRestoringVersion(null);
      }
    },
    [shareId, agg, restoringVersion]
  );

  // ── JAVNA/ZASEBNA POVEZAVA (lastnik) ──────────────────────────────────
  const togglePublic = useCallback(
    async (next: boolean) => {
      setBusy(true);
      setActionError(null);
      try {
        const r = await apiJson(`/api/trip/${encodeURIComponent(shareId)}`, {
          method: "PATCH",
          editToken,
          body: JSON.stringify({ isPublic: next }),
        });
        const data = (await r.json()) as {
          success?: boolean;
          error?: string;
        };
        if (!r.ok || !data.success) {
          setActionError(data.error ?? L.httpError[lang](r.status));
          return;
        }
        void load();
      } catch (e) {
        setActionError(errText(e));
      } finally {
        setBusy(false);
      }
    },
    [shareId, editToken, load, lang]
  );

  // ── PREIMENOVANJE s CAS (lastnik/urednik) ─────────────────────────────
  const saveName = useCallback(async () => {
    if (!agg) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === nameRef.current) {
      setRenameState(trimmed === nameRef.current ? "saved" : "idle");
      return;
    }
    setRenameState("saving");
    setActionError(null);
    try {
      const r = await apiJson(
        `/api/itinerary/shared/${encodeURIComponent(shareId)}`,
        {
          method: "PATCH",
          editToken,
          body: JSON.stringify({
            baseVersion: agg.version.contentVersion,
            name: trimmed,
          }),
        }
      );
      const data = (await r.json()) as {
        success?: boolean;
        contentVersion?: number;
        error?: string;
        conflict?: boolean;
      };
      if (r.status === 409 || data.conflict) {
        setRenameState("conflict");
        return;
      }
      if (!r.ok || !data.success) {
        setRenameState("idle");
        setActionError(data.error ?? L.httpError[lang](r.status));
        return;
      }
      nameRef.current = trimmed;
      setRenameState("saved");
      void load();
    } catch (e) {
      setRenameState("idle");
      setActionError(errText(e));
    }
  }, [agg, nameDraft, shareId, editToken, load, lang]);

  const copyInvite = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${inviteUrl}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError(L.copyFailed[lang]);
    }
  }, [inviteUrl, lang]);

  const role = agg?.role ?? "NONE";
  const showPanel =
    role === "OWNER" || role === "EDITOR" || inviteToken != null;

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{L.collabUnavailable[lang](loadError)}</span>
        </CardContent>
      </Card>
    );
  }

  if (!showPanel && inviteState === "idle") return null;

  const loggedIn =
    sessionStatus === "authenticated" &&
    session?.user?.accountType === "user";

  return (
    <div className="space-y-4">
      {/* ── TRAK VABILA (?invite=…) ──────────────────────────────────── */}
      {inviteToken && (
        <Card className="border-violet-300 ring-1 ring-violet-300/50">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-violet-700 dark:text-violet-400" aria-hidden="true" />
              <p className="text-sm font-semibold">
                {L.inviteBannerTitle[lang]}
              </p>
            </div>
            {inviteState === "accepted" ? (
              <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                {L.inviteAcceptedPrefix[lang]}{" "}
                <strong>
                  {L.roleLabels[lang][acceptedRole ?? ""] ?? acceptedRole}
                </strong>
              </p>
            ) : !loggedIn ? (
              <p className="text-sm text-muted-foreground">
                {L.inviteLoginPrefix[lang]}{" "}
                <a
                  className="font-medium underline underline-offset-2"
                  href={`/prijava?next=/pot/${shareId}%3Finvite%3D${encodeURIComponent(inviteToken)}`}
                >
                  {L.inviteLoginLink[lang]}
                </a>
                .
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={acceptInvite} disabled={inviteState === "accepting"}>
                  {inviteState === "accepting" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {L.acceptInvite[lang]}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {L.inviteRoleHint[lang]}
                </p>
              </div>
            )}
            {inviteState === "error" && actionError && (
              <p className="text-sm text-destructive">{actionError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── UPRAVLJANJE (lastnik / urednik) ──────────────────────────── */}
      {(role === "OWNER" || role === "EDITOR") && agg && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Users className="h-4 w-4" aria-hidden="true" />
              {L.sectionTitle[lang]}
              <Badge variant="secondary">
                {L.roleLabels[lang][role] ?? role}
              </Badge>
              {!agg.isPublic && (
                <Badge className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  {L.privateLinkBadge[lang]}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {actionError && (
              <p className="text-sm text-destructive" role="alert">
                {actionError}
              </p>
            )}

            {/* Preimenovanje (CAS) */}
            <div className="space-y-2">
              <Label htmlFor="trip-name" className="text-sm font-medium">
                {L.nameLabel[lang]}
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="trip-name"
                  value={nameDraft}
                  maxLength={120}
                  onChange={(e) => {
                    setNameDraft(e.target.value);
                    setRenameState("idle");
                  }}
                  placeholder={L.namePlaceholder[lang]}
                />
                <Button
                  onClick={saveName}
                  disabled={
                    renameState === "saving" || !nameDraft.trim() || nameDraft.trim() === nameRef.current
                  }
                  className="shrink-0"
                >
                  {renameState === "saving" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {L.saveName[lang]}
                </Button>
              </div>
              {renameState === "saved" && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {L.nameSaved[lang](agg.version.contentVersion)}
                </p>
              )}
              {renameState === "conflict" && (
                <p className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {L.renameConflictPrefix[lang]}
                  <Button variant="outline" size="sm" onClick={() => void load()}>
                    <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
                    {L.refresh[lang]}
                  </Button>
                  {L.conflictSuffix[lang]}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {L.casNote[lang]}
              </p>
            </div>

            {/* ISSUE #4 §22 (val 5): ZGODOVINA VERZIJ — revizije vsebine
                (undo na strežniku). Vsaka zamenjava vsebine (posodobitev
                v načrtovalniku / obnovitev) arhivira prejšnjo različico;
                tu jo lahko lastnik/urednik pogleda in OBNOVI. Obnovitev je
                sama urejanje (dela novo revizijo) — zgodovina ostane celo. */}
            <div className="space-y-2 border-t pt-4">
              <button
                type="button"
                onClick={toggleRevisions}
                aria-expanded={revisionsOpen}
                className="flex w-full flex-wrap items-center gap-2 text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                <History className="h-4 w-4" aria-hidden="true" />
                {L.versionHistory[lang]}
                <Badge variant="secondary" className="ml-1">
                  v{agg.version.contentVersion}
                </Badge>
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {revisionsOpen ? L.hide[lang] : L.show[lang]}
                </span>
              </button>

              {revisionsOpen && (
                <div className="space-y-2">
                  {revisions === null && !revisionsError && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {L.loadingRevisions[lang]}
                    </p>
                  )}
                  {revisionsError && (
                    <p className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      {revisionsError}
                      <Button variant="outline" size="sm" onClick={() => void loadRevisions()}>
                        <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
                        {L.tryAgain[lang]}
                      </Button>
                    </p>
                  )}
                  {revisions !== null && revisions.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {L.noOlderRevisions[lang](agg.version.contentVersion)}
                    </p>
                  )}
                  {revisions !== null && revisions.length > 0 && (
                    <>
                      <ul className="divide-y rounded-md border">
                        {revisions.map((r) => (
                          <li
                            key={r.version}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                          >
                            <span className="font-mono text-xs font-semibold">
                              v{r.version}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(r.createdAt).toLocaleString(dateLocale)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {(r.sizeBytes / 1024).toFixed(0)} KB
                            </span>
                            <span className="ml-auto">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void restoreVersion(r.version)}
                                disabled={
                                  restoringVersion !== null ||
                                  restoreState === "done"
                                }
                              >
                                {restoringVersion === r.version ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                                ) : null}
                                {L.restore[lang]}
                              </Button>
                            </span>
                          </li>
                        ))}
                      </ul>
                      {restoreState === "done" && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">
                          {L.restoredNote[lang]}
                        </p>
                      )}
                      {restoreState === "conflict" && (
                        <p className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          {L.restoreConflictPrefix[lang]}
                          <Button variant="outline" size="sm" onClick={() => void load()}>
                            <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
                            {L.refresh[lang]}
                          </Button>
                          {L.conflictSuffix[lang]}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {L.restoreNote[lang]}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Vabila (samo lastnik) */}
            {role === "OWNER" && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  <p className="text-sm font-medium">{L.inviteSectionTitle[lang]}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-role" className="text-xs text-muted-foreground">
                      {L.roleLabel[lang]}
                    </Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger id="invite-role" className="w-full sm:w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EDITOR">
                          {L.roleEditorDesc[lang]}
                        </SelectItem>
                        <SelectItem value="COMMENTER">
                          {L.roleCommenterDesc[lang]}
                        </SelectItem>
                        <SelectItem value="VIEWER">
                          {L.roleViewerDesc[lang]}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="invite-email" className="text-xs text-muted-foreground">
                      {L.emailLabel[lang]}
                    </Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      maxLength={254}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder={L.emailPlaceholder[lang]}
                    />
                  </div>
                  <Button onClick={issueInvite} disabled={busy} className="shrink-0">
                    {busy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {L.issueInvite[lang]}
                  </Button>
                </div>

                {inviteUrl && (
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    <p className="flex flex-wrap items-center gap-2 text-xs font-medium">
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {L.inviteLinkTitle[lang]}
                    </p>
                    <code className="block break-all rounded bg-background px-2 py-1 text-xs">
                      {inviteUrl}
                    </code>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={copyInvite}>
                        {copied ? (
                          <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {copied ? L.copied[lang] : L.copy[lang]}
                      </Button>
                      {inviteNote && (
                        <span className="text-xs text-muted-foreground">
                          {inviteNote}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Seznam sodelujočih (samo lastnik) */}
            {role === "OWNER" && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-medium">{L.collaboratorsTitle[lang]}</p>
                {(!agg.collaborators || agg.collaborators.length === 0) && (
                  <p className="text-xs text-muted-foreground">
                    {L.noCollaborators[lang](
                      loggedIn
                        ? L.ownershipAccount[lang]
                        : L.ownershipClaim[lang]
                    )}
                  </p>
                )}
                <ul className="space-y-2">
                  {(agg.collaborators ?? []).map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate text-sm font-medium">
                          {c.accountEmail ?? c.accountName ?? c.inviteEmail ?? L.inviteeNoEmail[lang]}
                        </p>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            {L.roleLabels[lang][c.role] ?? c.role}
                          </Badge>
                          <span>
                            {L.statusLabels[lang][c.status] ?? c.status}
                            {c.acceptedAt
                              ? L.acceptedOn[lang](
                                  new Date(c.acceptedAt).toLocaleDateString(dateLocale)
                                )
                              : L.invitedOn[lang](
                                  new Date(c.createdAt).toLocaleDateString(dateLocale)
                                )}
                          </span>
                        </p>
                      </div>
                      {role === "OWNER" && c.status !== "REVOKED" && (
                        <div className="flex shrink-0 items-center gap-2">
                          <Select
                            value={c.role}
                            onValueChange={(v) =>
                              void patchCollaborator(c.id, { role: v })
                            }
                          >
                            <SelectTrigger className="h-9 w-40" aria-label={L.changeRoleAria[lang]}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EDITOR">{L.roleLabels[lang].EDITOR}</SelectItem>
                              <SelectItem value="COMMENTER">{L.roleLabels[lang].COMMENTER}</SelectItem>
                              <SelectItem value="VIEWER">{L.roleLabels[lang].VIEWER}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void patchCollaborator(c.id, { status: "REVOKED" })
                            }
                            disabled={busy}
                          >
                            {L.revokeAccess[lang]}
                          </Button>
                        </div>
                      )}
                      {c.status === "REVOKED" && (
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {L.accessRevoked[lang]}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void patchCollaborator(c.id, { role: c.role })
                            }
                            disabled={busy}
                          >
                            {L.inviteAgain[lang]}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Javna/zasebna povezava (samo lastnik) */}
            {role === "OWNER" && (
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Link2 className="h-4 w-4" aria-hidden="true" />
                      {L.publicLinkTitle[lang]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {L.publicLinkDesc[lang]}
                    </p>
                  </div>
                  <Switch
                    checked={agg.isPublic}
                    onCheckedChange={(v) => void togglePublic(v)}
                    disabled={busy}
                    aria-label={L.publicLinkAria[lang]}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

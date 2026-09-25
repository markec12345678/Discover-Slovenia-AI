"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Save,
  Trash2,
  X,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

/**
 * ExperienceAvailabilityDialog — TASK 33 (Tier 2 #1, 1.110.0):
 * lastniški koledar razpoložljivosti izkušnje.
 *
 * Površina je SL-only inline (enako kot experience-form.tsx in ostale
 * lastniške forme — owner portal je slovenski).
 *
 * Trije sklopi (mandat COMPETITIVE-ANALYSIS C1: kapaciteta/dan + blackout +
 * sezona):
 *   1. NASTAVITVE — privzeta dnevna kapaciteta + sezonsko okno (PUSTI
 *      prazno = neomejeno/brez sezone; start > end = čezletna sezona);
 *   2. MESEČNA MREŽA — klik prihodnjega dneva odpre urejevalnik prepisa
 *      (zaprto/odprto + kapaciteta + opomba) + odstranjevanje prepisa;
 *   3. OBSEG — orodje "zapri obseg datumov" (npr. zimski zaprti tedni).
 *
 * Iskrenost: pretekli dnevi so zaklenjeni (ni smisla spreminjati zgodovine),
 * zasedenost (Št. gostov/kapaciteta) je živi podatke iz rezervacij.
 */

interface DayView {
  date: string;
  past: boolean;
  available: boolean;
  reason: "blackout" | "out-of-season" | null;
  capacity: number | null;
  booked: number;
  remaining: number | null;
  override: {
    date: string;
    status: "open" | "closed";
    capacity: number | null;
    note: string | null;
  } | null;
}

interface MonthData {
  month: string;
  settings: {
    defaultCapacity: number | null;
    seasonStart: string | null;
    seasonEnd: string | null;
  } | null;
  days: DayView[];
}

interface ExperienceAvailabilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  experience: { id: string; name: string } | null;
}

// Slovenska imena mesecev (fiksno — brez odvisnosti od locale runtimea)
const MONTH_NAMES_SL = [
  "januar",
  "februar",
  "marec",
  "april",
  "maj",
  "junij",
  "julij",
  "avgust",
  "september",
  "oktober",
  "november",
  "december",
];

const WEEKDAYS_SL = ["pon", "tor", "sre", "čet", "pet", "sob", "ned"];

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTH_NAMES_SL[m - 1] ?? monthKey} ${y}`;
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExperienceAvailabilityDialog({
  open,
  onOpenChange,
  experience,
}: ExperienceAvailabilityDialogProps) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(currentMonthKey());
  const [data, setData] = useState<MonthData | null>(null);

  // Nastavitve (osnutek forme)
  const [capDraft, setCapDraft] = useState("");
  const [seasonStartDraft, setSeasonStartDraft] = useState("");
  const [seasonEndDraft, setSeasonEndDraft] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Urejevalnik dneva
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayStatus, setDayStatus] = useState<"open" | "closed">("closed");
  const [dayCapacity, setDayCapacity] = useState("");
  const [dayNote, setDayNote] = useState("");
  const [daySaving, setDaySaving] = useState(false);
  const [dayDeleting, setDayDeleting] = useState(false);

  // Obseg (zapri obseg)
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeSaving, setRangeSaving] = useState(false);

  // ── Nalaganje meseca ─────────────────────────────────────────────────────
  const fetchMonth = useCallback(
    async (experienceId: string, monthKey: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/owner/experiences/${experienceId}/availability?month=${monthKey}`,
          { cache: "no-store" }
        );
        const body = (await res.json().catch(() => null)) as
          | MonthData
          | { error: string }
          | null;
        if (!res.ok || !body || "error" in body) {
          throw new Error(
            (body as { error?: string } | null)?.error ??
              "Koledarja ni bilo mogoče naložiti."
          );
        }
        setData(body);
        // Osnutek nastavitev napolni samo ob prvem nalaganju (ne med tipkanjem)
        setCapDraft(
          body.settings?.defaultCapacity !== null &&
            body.settings?.defaultCapacity !== undefined
            ? String(body.settings.defaultCapacity)
            : ""
        );
        setSeasonStartDraft(body.settings?.seasonStart ?? "");
        setSeasonEndDraft(body.settings?.seasonEnd ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Napaka nalaganja koledarja.");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (open && experience) {
      setMonth(currentMonthKey());
      setSelectedDate(null);
      void fetchMonth(experience.id, currentMonthKey());
    }
  }, [open, experience, fetchMonth]);

  const changeMonth = (next: string) => {
    if (!experience) return;
    setMonth(next);
    setSelectedDate(null);
    void fetchMonth(experience.id, next);
  };

  // ── Shranjevanje nastavitev ──────────────────────────────────────────────
  const saveSettings = async () => {
    if (!experience) return;
    setSettingsSaving(true);
    try {
      const res = await fetch(
        `/api/owner/experiences/${experience.id}/availability`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            defaultCapacity: capDraft.trim() === "" ? null : Number(capDraft.trim()),
            seasonStart: seasonStartDraft || null,
            seasonEnd: seasonEndDraft || null,
          }),
        }
      );
      const body = (await res.json().catch(() => null)) as
        | { success?: boolean; message?: string; error?: string }
        | null;
      if (!res.ok || !body?.success) {
        throw new Error(body?.error ?? "Shranjevanje ni uspelo.");
      }
      toast({
        title: "Nastavitve shranjene",
        description: body.message ?? undefined,
      });
      await fetchMonth(experience.id, month);
    } catch (e) {
      toast({
        title: "Napaka",
        description: e instanceof Error ? e.message : "Shranjevanje ni uspelo.",
        variant: "destructive",
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  // ── Urejanje dneva ───────────────────────────────────────────────────────
  const selectDay = (day: DayView) => {
    if (day.past) return;
    setSelectedDate(day.date);
    if (day.override) {
      setDayStatus(day.override.status);
      setDayCapacity(
        day.override.capacity !== null ? String(day.override.capacity) : ""
      );
      setDayNote(day.override.note ?? "");
    } else {
      // Privzeto za nov prepis: nasprotno od trenutnega stanja
      setDayStatus(day.available ? "closed" : "open");
      setDayCapacity("");
      setDayNote("");
    }
  };

  const saveDay = async () => {
    if (!experience || !selectedDate) return;
    setDaySaving(true);
    try {
      const res = await fetch(
        `/api/owner/experiences/${experience.id}/availability/days`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: selectedDate,
            status: dayStatus,
            capacity:
              dayStatus === "open" && dayCapacity.trim() !== ""
                ? Number(dayCapacity.trim())
                : null,
            note: dayNote.trim() || null,
          }),
        }
      );
      const body = (await res.json().catch(() => null)) as
        | { success?: boolean; message?: string; error?: string }
        | null;
      if (!res.ok || !body?.success) {
        throw new Error(body?.error ?? "Shranjevanje dneva ni uspelo.");
      }
      toast({ title: "Prepis shranjen", description: body.message ?? undefined });
      await fetchMonth(experience.id, month);
    } catch (e) {
      toast({
        title: "Napaka",
        description: e instanceof Error ? e.message : "Shranjevanje ni uspelo.",
        variant: "destructive",
      });
    } finally {
      setDaySaving(false);
    }
  };

  const deleteDay = async () => {
    if (!experience || !selectedDate) return;
    setDayDeleting(true);
    try {
      const res = await fetch(
        `/api/owner/experiences/${experience.id}/availability/days?date=${selectedDate}`,
        { method: "DELETE" }
      );
      const body = (await res.json().catch(() => null)) as
        | { success?: boolean; message?: string; error?: string }
        | null;
      if (!res.ok || !body?.success) {
        throw new Error(body?.error ?? "Odstranjevanje ni uspelo.");
      }
      toast({
        title: "Prepis odstranjen",
        description: "Dan upošteva privzeta pravila (sezona/kapaciteta).",
      });
      await fetchMonth(experience.id, month);
    } catch (e) {
      toast({
        title: "Napaka",
        description: e instanceof Error ? e.message : "Odstranjevanje ni uspelo.",
        variant: "destructive",
      });
    } finally {
      setDayDeleting(false);
    }
  };

  // ── Zapiranje obsega ─────────────────────────────────────────────────────
  const closeRange = async () => {
    if (!experience || !rangeFrom || !rangeTo) return;
    setRangeSaving(true);
    try {
      const res = await fetch(
        `/api/owner/experiences/${experience.id}/availability/days`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dateFrom: rangeFrom,
            dateTo: rangeTo,
            status: "closed",
          }),
        }
      );
      const body = (await res.json().catch(() => null)) as
        | { success?: boolean; message?: string; error?: string }
        | null;
      if (!res.ok || !body?.success) {
        throw new Error(body?.error ?? "Zapiranje obsega ni uspelo.");
      }
      toast({ title: "Obseg zaprt", description: body.message ?? undefined });
      setRangeFrom("");
      setRangeTo("");
      await fetchMonth(experience.id, month);
    } catch (e) {
      toast({
        title: "Napaka",
        description: e instanceof Error ? e.message : "Zapiranje obsega ni uspelo.",
        variant: "destructive",
      });
    } finally {
      setRangeSaving(false);
    }
  };

  // ── Mreža meseca (ponedeljek prvi) ───────────────────────────────────────
  const grid = useMemo(() => {
    if (!data) return null;
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const leading = (first.getUTCDay() + 6) % 7; // pon = 0
    const cells: (DayView | null)[] = Array.from({ length: leading }, () => null);
    cells.push(...data.days);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [data, month]);

  const selectedDay = useMemo(
    () => data?.days.find((d) => d.date === selectedDate) ?? null,
    [data, selectedDate]
  );

  const tKey = todayKey();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" aria-hidden="true" />
            Koledar razpoložljivosti
          </DialogTitle>
          <DialogDescription>
            {experience?.name ?? "Izkušnja"} — kapaciteta na dan, zaprti dnevi
            in sezona. Brez nastavitev je rezervacija neomejena.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {/* ── 1. Nastavitve ── */}
        <section
          aria-label="Nastavitve razpoložljivosti"
          className="rounded-xl border border-border/60 bg-muted/20 p-4"
        >
          <h3 className="text-sm font-semibold">Osnovna pravila</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="av-cap" className="text-xs">
                Dnevna kapaciteta
              </Label>
              <Input
                id="av-cap"
                type="number"
                min={1}
                max={10000}
                placeholder="neomejeno"
                value={capDraft}
                onChange={(e) => setCapDraft(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="av-season-start" className="text-xs">
                Sezona od
              </Label>
              <Input
                id="av-season-start"
                type="date"
                value={seasonStartDraft}
                onChange={(e) => setSeasonStartDraft(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="av-season-end" className="text-xs">
                Sezona do
              </Label>
              <Input
                id="av-season-end"
                type="date"
                value={seasonEndDraft}
                onChange={(e) => setSeasonEndDraft(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Prazna polja = brez omejitve. Sezona &raquo;od&laquo; po &raquo;do&laquo;
            (npr. 15.11. → 15.3.) pomeni čezletno (zimsko) sezono. Vsi trije
            vnosi prazni = koledar izklopljen.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3 gap-1.5"
            disabled={settingsSaving || loading}
            onClick={saveSettings}
          >
            {settingsSaving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-3.5" aria-hidden="true" />
            )}
            Shrani pravila
          </Button>
        </section>

        {/* ── 2. Mesečna mreža ── */}
        <section aria-label="Mesečni koledar" className="rounded-xl border border-border/60 p-4">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Prejšnji mesec"
              onClick={() => changeMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <p className="text-sm font-semibold capitalize">
              {monthLabel(month)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Naslednji mesec"
              onClick={() => changeMonth(shiftMonth(month, 1))}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2
                className="size-6 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          ) : grid ? (
            <>
              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {WEEKDAYS_SL.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {grid.map((day, i) =>
                  day === null ? (
                    <span key={`blank-${i}`} aria-hidden="true" />
                  ) : (
                    <button
                      key={day.date}
                      type="button"
                      disabled={day.past}
                      aria-label={`${day.date}${
                        day.available
                          ? day.remaining !== null
                            ? `, prostih mest: ${day.remaining}`
                            : ""
                          : ", ni na voljo"
                      }`}
                      onClick={() => selectDay(day)}
                      className={[
                        "relative flex h-12 flex-col items-center justify-center rounded-md border text-sm tabular-nums transition-colors",
                        day.past
                          ? "cursor-not-allowed border-transparent text-muted-foreground/30"
                          : day.available === false && day.reason === "blackout"
                            ? "border-destructive/30 bg-destructive/10 text-destructive line-through hover:bg-destructive/15"
                            : day.available === false
                              ? "border-transparent bg-muted text-muted-foreground/60 hover:bg-muted/80"
                              : day.override
                                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                                : day.remaining === 0
                                  ? "border-destructive/40 text-destructive"
                                  : "border-border/60 bg-background hover:bg-muted",
                        selectedDate === day.date
                          ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                          : "",
                      ].join(" ")}
                    >
                      <span>{Number(day.date.slice(8))}</span>
                      <span className="text-[9px] font-normal opacity-80">
                        {day.capacity !== null
                          ? `${day.booked}/${day.capacity}`
                          : day.booked > 0
                            ? `${day.booked}`
                            : ""}
                      </span>
                    </button>
                  )
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="size-2.5 rounded-sm bg-destructive/20" /> zaprto (blackout)
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2.5 rounded-sm bg-muted" /> izven sezone
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2.5 rounded-sm bg-primary/20" /> prepis dneva
                </span>
                <span>
                  št. gosti/kapaciteta pod dnem
                </span>
              </div>
            </>
          ) : null}
        </section>

        {/* ── 3. Urejevalnik izbranega dne ── */}
        {selectedDate ? (
          <section
            aria-label="Urejanje izbranega dne"
            className="rounded-xl border border-primary/30 bg-primary/5 p-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Dan {selectedDate}
                {selectedDay?.override ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ( obstoječ prepis )
                  </span>
                ) : null}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Zapri urejevalnik dneva"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="av-day-status" className="text-xs">
                  Stanje
                </Label>
                <Select
                  value={dayStatus}
                  onValueChange={(v) => setDayStatus(v === "open" ? "open" : "closed")}
                >
                  <SelectTrigger id="av-day-status" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closed">Zaprt (blackout)</SelectItem>
                    <SelectItem value="open">Odprt — izjemni dan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="av-day-cap" className="text-xs">
                  Kapaciteta tega dne
                </Label>
                <Input
                  id="av-day-cap"
                  type="number"
                  min={1}
                  max={10000}
                  placeholder="privzeta"
                  value={dayCapacity}
                  disabled={dayStatus === "closed"}
                  onChange={(e) => setDayCapacity(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="av-day-note" className="text-xs">
                  Opomba (razlog)
                </Label>
                <Input
                  id="av-day-note"
                  type="text"
                  maxLength={200}
                  placeholder="npr. zasebni dogodek"
                  value={dayNote}
                  onChange={(e) => setDayNote(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              &raquo;Odprt — izjemni dan&laquo; prepiše sezono (npr. en odprt
              vikend zunaj sezone). Zaprt dan vedno zavrne rezervacije.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={daySaving}
                onClick={saveDay}
              >
                {daySaving ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="size-3.5" aria-hidden="true" />
                )}
                Shrani prepis
              </Button>
              {selectedDay?.override ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  disabled={dayDeleting}
                  onClick={deleteDay}
                >
                  {dayDeleting ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  )}
                  Odstrani prepis
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* ── 4. Orodje: zapri obseg ── */}
        <section
          aria-label="Zapri obseg datumov"
          className="rounded-xl border border-border/60 p-4"
        >
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
            Zapri obseg datumov
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="av-range-from" className="text-xs">
                Od
              </Label>
              <Input
                id="av-range-from"
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="av-range-to" className="text-xs">
                Do
              </Label>
              <Input
                id="av-range-to"
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 gap-1.5"
            disabled={rangeSaving || !rangeFrom || !rangeTo || rangeFrom > rangeTo}
            onClick={closeRange}
          >
            {rangeSaving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Lock className="size-3.5" aria-hidden="true" />
            )}
            Zapri izbrane dneve
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Za vsak dan obsega se ustvari prepis &raquo;zaprto&laquo; (največ
            366 dni na klic). Prepike lahko kasneje odstraniš posamično v
            mreži. Danes je {tKey}.
          </p>
        </section>
      </DialogContent>
    </Dialog>
  );
}

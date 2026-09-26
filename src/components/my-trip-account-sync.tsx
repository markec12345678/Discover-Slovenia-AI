"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

import { syncMyTripToServer, startMyTripDiffSync } from "@/lib/my-trip-sync";

/**
 * MyTripAccountSync — NEVIDENI gonilev strežniške refleksije zbirke
 * "Moja pot" (TASK 8 / F2-A, Issue #8 Faza 2).
 *
 * Namenčeno brez lastnega UI: izrisuje null. Dve odgovornosti:
 *
 *  1. SEJA GOST → B2C uporabnik (prijava/registracija kadarkoli):
 *     sproži syncMyTripToServer() — lokalna zbirka se prenese v račun
 *     (union-merge) + prinese predmete z drugih naprav. (Prijava prek
 *     /prijava kliče to SAMO — a seja lahko nastane tudi drugod: impuls
 *     tukaj pokrije VSE prehode v B2C sejo.)
 *  2. MED B2C sejo: poganja različno sinhronizacijo
 *     (startMyTripDiffSync) — dodajanja/odstranjevanja se po debounce
 *     širijo na /api/my-trip (vsi controlled write-through površini
 *     vključno, ker vse pišejo prek istega modula my-trip.ts).
 *
 * Gost: NE naredi NIČ (zbirka ostaja čisto lokalna — ni klica na server).
 * Owner/B2B seja: NE naredi NIČ (zbirka je vezana na B2C račune).
 *
 * Priklopljen v Navigation (stranski učinek na vseh straneh z lupino —
 * isto mesto kot MobileTabBar; server bundle ostaja nedotaknjen).
 */

export function MyTripAccountSync() {
  const { data: session, status } = useSession();
  // Zadnji obdelani "authentikacijski" ključ — prehod gost→uporabnik
  // prepoznamo SAMO ob spremembi (ne ob vsakem re-renderu).
  const lastUserKeyRef = useRef<string | null>(null);

  const isB2CUser =
    status === "authenticated" && session?.user?.accountType === "user";
  const userKey = isB2CUser ? (session?.user?.id ?? "user") : null;

  useEffect(() => {
    // 1) Prehod v B2C sejo (iz gostove ali sveže strani po prijavi):
    //    celotna sinhronizacija — push lokalne + pull z drugih naprav.
    if (isB2CUser && userKey && lastUserKeyRef.current !== userKey) {
      lastUserKeyRef.current = userKey;
      // Neblokirajoče + fail-open (my-trip-sync notranje varuje)
      void syncMyTripToServer();
    }
    if (!isB2CUser) {
      lastUserKeyRef.current = null;
    }
  }, [isB2CUser, userKey]);

  useEffect(() => {
    // 2) Med B2C sejo: različna sinhronizacija (debounce 2.5 s).
    if (!isB2CUser) return;
    return startMyTripDiffSync(2500);
  }, [isB2CUser]);

  return null;
}

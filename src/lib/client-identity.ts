// ============================================================================
// ANONIMNA IDENTITETA OBISKOVALCA (localStorage) — ENKRATEN VIR (99-b)
// ============================================================================
// Ključa "discoverslovenia_voter" (anonimni clientId) in
// "discoverslovenia_comment_name" (prihranjeno ime avtorja) sta bila
// NEODVISNO reimplementirana v ŠTIRIH komponentah:
//   - shared-trip.tsx  (glasovanje skupine — VOTER_STORAGE_KEY)
//   - trip-social.tsx  (všečki + komentarji — CLIENT_ID/AUTHOR_NAME key)
//   - trip-diary.tsx   (potni dnevnik)
//   - trip-polls.tsx   (ankete)
// Od 99-b je ta knjižnica edini vir — isti brskalnik = isti anonimni
// obiskovalec za glasove, všečke, komentarje, ankete in dnevnik.
//
// Semantika (iz trip-social.tsx — nespremenjena):
//   - clientId: preberi; če manjka ALI ne ustreza CLIENT_ID_RE → ustvari
//     nov (crypto.randomUUID(); fallback "v-<čas>-<naključje>") in ga
//     ZAPIŠI nazaj
//   - vse v try/catch — private mode vrne null in ne sesuje komponente
//     (klicatelj v tem primeru pusti svoje stanje nedotaknjeno)
//   - ime: preberi/zapiši kot niz BREZ trimanja — trim in validacijo
//     dolžine ima vsaka komponenta svojo (obnašanje ostaja enako)
// ============================================================================

/** localStorage ključ anonimnega ID-ja obiskovalca (glasi/všečki/komentarji). */
export const VOTER_KEY = "discoverslovenia_voter";

/** localStorage ključ prihravljenega imena avtorja (komentarji/dnevnik/ankete). */
export const AUTHOR_NAME_KEY = "discoverslovenia_comment_name";

/** Veljaven clientId (enak vzorec kot API). */
const CLIENT_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * Prebere (po potrebi ustvari in zapiše) anonimni clientId obiskovalca.
 * SEMANTIKA IZ TRIP-SOCIAL.TSX: smeten/kratek/zapravljen ID se regenerira
 * in prepiše, veljaven ID se ponovno uporabi. Vrne null, če localStorage
 * ni dostopen (private mode) — klicatelj naj stanja ne nastavlja.
 */
export function getVoterId(): string | null {
  try {
    let cid = window.localStorage.getItem(VOTER_KEY);
    if (!cid || !CLIENT_ID_RE.test(cid)) {
      cid =
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `v-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(VOTER_KEY, cid);
    }
    return cid;
  } catch {
    // localStorage nedostopen (private mode) — brez anonimne identitete
    return null;
  }
}

/**
 * Prebere prihranjeno ime avtorja (null = ni še shranjeno ali storage
 * nedostopen). NE trima — komponente imajo svoje validacije dolžine.
 */
export function getAuthorName(): string | null {
  try {
    return window.localStorage.getItem(AUTHOR_NAME_KEY);
  } catch {
    return null;
  }
}

/**
 * Zapomni si ime avtorja za naslednji komentar/vpis/anketo — defenzivno:
 * poln/zasebni localStorage se mirno preskoči (brez throw).
 */
export function saveAuthorName(name: string): void {
  try {
    window.localStorage.setItem(AUTHOR_NAME_KEY, name);
  } catch {
    // private mode — ignore
  }
}

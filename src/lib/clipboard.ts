// D7 (1.140.0): odložišče z rezervo — skupni vzorec, ki je bil doslej
// podvojen trikrat (copyShareLink v itinerary-planner, copyLink v
// social-share, copyInvite v trip-collaboration). NOVA koda (embed snippet)
// ga uporablja; obstoječe tri pusti pri miru (izven obsega D7, refaktor
// bi mešal vrata UI regresa z novo funkcionalnostjo).
//
// Vrstni red: (1) async Clipboard API (varni konteksti), (2) skrita
// <textarea> + execCommand rezerva (http/file konteksti, starejši
// brskalniki) — isti kanon kot copyShareLink. Oba padca → false
// (klient lahko kodo vedno prepiše ročno — <pre> je izberljiv).

export async function copyToClipboard(text: string): Promise<boolean> {
  // (1) Clipboard API — kjer je na voljo
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // padec (npr. Permission denied) → poskusi rezervo
  }

  // (2) execCommand rezerva — samo v DOM okolju
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    // izven vizualnega toka + izven tab navigacije — ne utiha ne moti
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

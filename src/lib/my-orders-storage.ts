// "Moje rezervacije / naročila" — localStorage sledenje številkam (FW2-B)
//
// Problem: anonimen popotnik opravi rezervacijo/nakup in številko vidi samo
// enkrat (v potrditvenem pogledu modala). Brez računa ne more pride do svojih
// številk → podpora pri ponudniku je nemogoča.
//
// Rešitev: ob vsakem uspešnem zaključku zapišemo številko v localStorage.
// Prihodnja "Moja potovanja" stran/jo jih prebere in prikaže.
//
// KONTRAKT (določen vodje — NE odstopaj):
//   - ključ "dai:my-bookings" (rezervacije izkušenj) oz. "dai:my-orders"
//     (naročila iz checkout-a — zapisuje paralelni agent v checkout-modal)
//   - vsebina: JSON array ČISTIH nizov (številke), najnovejše NAJPREJ
//   - max 50 vnosov, deduplicirano
//   - obrambno branje/pisanje — pokvarjen/ poln storage ne sme sesesti app
//
// Shranjujemo SAMO številke (javni, nesignificirani identifikatorji) — brez PII.

const BOOKINGS_KEY = "dai:my-bookings";
const ORDERS_KEY = "dai:my-orders";
const MAX_NUMBERS = 50; // zadnjih 50 (najstarejši odpadejo s konca)
const NUMBER_MAX_LENGTH = 32; // številke so kratke; daljše = sumljiv vnos

/** Notranje: preberi seznam številk (varno — pokvarjen ne sesuje app). */
function readNumbers(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const numbers: string[] = [];
    for (const item of parsed) {
      if (typeof item === "string" && item.trim() && item.length <= NUMBER_MAX_LENGTH) {
        numbers.push(item);
      }
    }
    return numbers.slice(0, MAX_NUMBERS);
  } catch {
    // Poln ali pokvarjen localStorage — začnemo s praznim seznamom
    return [];
  }
}

/**
 * Notranje: dodaj številko (novonajprej, dedup, cap 50).
 * Če številka že obstaja, se premakne na vrh (osveži "najnovejšost").
 */
function addNumber(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    const number = value.trim().slice(0, NUMBER_MAX_LENGTH);
    if (!number) return;
    const rest = readNumbers(key).filter((n) => n !== number);
    rest.unshift(number);
    window.localStorage.setItem(key, JSON.stringify(rest.slice(0, MAX_NUMBERS)));
  } catch {
    // Poln/zasebni localStorage — mirno preskoči
  }
}

/**
 * Zapiši številko uspešne REZERVACIJE izkušnje (POST /api/bookings).
 * Kliče experience-modal v pogledu uspeha (bookingNumber iz strežnika).
 */
export function addBooking(bookingNumber: string): void {
  addNumber(BOOKINGS_KEY, bookingNumber);
}

/**
 * Zapiši številko uspešnega NAROČILA iz checkout-a (POST /api/checkout).
 * Namensko pripravljeno za paralelnega agenta (checkout-modal) — enak
 * obrambni vzorec kot addBooking.
 */
export function addOrderNumber(orderNumber: string): void {
  addNumber(ORDERS_KEY, orderNumber);
}

/** Vse shranjene številke rezervacij (najnovejše najprej) — za prihodnjo UI. */
export function getBookingNumbers(): string[] {
  return readNumbers(BOOKINGS_KEY);
}

/** Vse shranjene številke naročil (najnovejše najprej) — za prihodnjo UI. */
export function getOrderNumbers(): string[] {
  return readNumbers(ORDERS_KEY);
}

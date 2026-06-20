# 🤝 Prispevanje k I Feel Slovenia

Hvala za zanimanje za prispevanje k projektu! Ta vodič opisuje kako lahko pomagaš.

## 📋 Kazalo

- [Kodeks vedenja](#kodeks-vedenja)
- [Kako prispevati](#kako-prispevati)
- [Razvojni proces](#razvojni-proces)
- [Style guide](#style-guide)
- [Reporting bugs](#reporting-bugs)
- [Feature requests](#feature-requests)

---

## Kodeks vedenja

Sodelovanje v tem projektu pomeni strinjanje z naslednjimi načeli:

- **Spoštovanje** — do vseh sodelujočih, ne glede na izkušnje
- **Konstruktivnost** — kritika naj bo koristna in specifična
- **Odprtost** — odprti za nove ideje in pristope
- **Strpnost** — Slovenščina je glavni jezik, ampak angleščina dobrodošla

---

## Kako prispevati

### 1. Fork & Clone

```bash
# Fork repozitorij na GitHubu
# Nato kloniraj svoj fork
git clone https://github.com/TVOJ-USERNAME/i-feel-slovenia.git
cd i-feel-slovenia

# Dodaj upstream remote
git remote add upstream https://github.com/markec12345678/i-feel-slovenia.git
```

### 2. Ustvari feature branch

```bash
# Vedno delaj na novi branch
git checkout -b feature/nova-funkcionalnost
# ali
git checkout -b fix/popravek-bug-a
```

### 3. Razvoj

```bash
# Namesti odvisnosti
bun install

# Zaženi dev server
bun run dev

# Preveri lint
bun run lint
```

### 4. Commit

Uporabljaj [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: dodan nov filter za destinacije"
git commit -m "fix: popravljena napaka v AI itinererju"
git commit -m "docs: posodobljen README"
git commit -m "refactor: poenostavljena logika za košarico"
git commit -m "chore: posodobljene odvisnosti"
```

### 5. Push & Pull Request

```bash
git push origin feature/nova-funkcionalnost
```

Nato odpri Pull Request na GitHubu z opisom:
- **Kaj** si spremenil
- **Zakaj** si to spremenil
- **Kako** testirati
- Screenshot-i če je UI sprememba

---

## Razvojni proces

### Pred pošiljanjem PR-ja

- [ ] Koda compila brez napak (`bun run lint`)
- [ ] TypeScript strict (brez `any` tipov)
- [ ] SLOVENŠČINA v vseh UI besedilih (razen admin/owner dashboard)
- [ ] NO indigo/blue barve (uporabljaj primary zelena, accent terakota)
- [ ] Mobile-first responsive
- [ ] Dodal si komentarje za kompleksno logiko

### Review proces

1. **Avtomatski check** — CI preveri lint in build
2. **Code review** — maintainer pregleda kodo
3. **Testiranje** — preveri funkcionalnost
4. **Merge** — po odobritvi

### Časovni okvir

| Tip PR | Čas odgovora |
|--------|--------------|
| Bug fix (kritičen) | 24 ur |
| Bug fix (minor) | 3 dni |
| Feature | 5 dni |
| Dokumentacija | 2 dni |

---

## Style guide

### TypeScript

```typescript
// ✅ Dobro
interface Destination {
  id: string;
  name: string;
  coords: { lat: number; lng: number };
}

// ❌ Slabo
interface Destination {
  id: any;
  name: string;
  coords: any;
}
```

### React komponente

```tsx
// ✅ Dobro — "use client" za interaktivne komponente
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function MyComponent({ title }: { title: string }) {
  const [count, setCount] = useState(0);
  return <Button onClick={() => setCount(count + 1)}>{title}: {count}</Button>;
}

// ✅ Server component (brez "use client")
import { db } from "@/lib/db";

export async function ServerComponent() {
  const data = await db.listing.findMany();
  return <div>{data.length} listings</div>;
}
```

### CSS / Tailwind

```tsx
// ✅ Dobro — uporabljaj shadcn/ui variable
<div className="bg-primary text-primary-foreground" />

// ❌ Slabo — hardcode barve
<div className="bg-blue-500 text-white" />
```

### API Routes

```typescript
// ✅ Vedno z validacijo in error handling
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.required) {
      return NextResponse.json({ error: "Manjka obvezno polje" }, { status: 400 });
    }
    // ... logika
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/xxx] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
```

### Naming conventions

| Tip | Konvencija | Primer |
|-----|-----------|--------|
| Komponente | PascalCase | `DestinationModal` |
| Funkcije | camelCase | `getDestinationById` |
| Konstante | UPPER_SNAKE | `DESTINATIONS`, `REGIONS` |
| Datoteke | kebab-case | `slovenia-data.ts` |
| API routes | kebab-case | `/api/owner/listings` |
| Branch-i | kebab-case | `feature/ai-chatbot` |

---

## Reporting bugs

### Pred poročanjem

1. Preveri [existing issues](https://github.com/markec12345678/i-feel-slovenia/issues) — morda že obstaja
2. Poskusi z najnovejšo verzijo (`git pull origin main`)

### Bug report template

```markdown
**Opis bug-a**
Kratek opis problema.

**Koraki za reprodukcijo**
1. Pojdi na '...'
2. Klikni na '...'
3. Vidiš napako

**Pričakovano vedenje**
Kaj bi moralo zgoditi.

**Actual vedenje**
Kaj se dejansko zgodi.

**Screenshot**
(Če applicable)

**Environment**
- OS: [npr. macOS 14]
- Browser: [npr. Chrome 120]
- Node/Bun: [npr. Bun 1.3]
```

---

## Feature requests

Odpri [nov issue](https://github.com/markec12345678/i-feel-slovenia/issues/new) z labelo `enhancement` in opiši:

1. **Problem** ki ga rešuje
2. **Predlagana rešitev**
3. **Alternative** ki si jih premislil
4. **Dodatne informacije**

---

## 🏆 Priznanja

Vsi prispevki so cenjeni! Sodelavci bodo navedeni v:
- README.md (Contributors sekcija)
- Vsakem release note

---

## 📞 Kontakt

- **GitHub Issues** — za bug-e in feature requeste
- **Email** — admin@ifeelslovenia.si (za zasebne zadeve)
- **Pull Requests** — za kodne prispevke

---

**Hvala za tvoj prispevek!** 🇸🇮

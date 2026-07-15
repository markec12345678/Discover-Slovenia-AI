# Accessibility Review

> **Status:** Living document
> **Datum:** 2025-01-15
> **Namen:** WCAG 2.1 AA compliance pred produkcijo

---

## 1. WCAG 2.1 AA Standard

### 1.1 Štiri načela (POUR)

| Načelo | Opis | Status |
|--------|------|--------|
| **Perceivable** | Vsebina mora biti zaznavna | ⚠️ Preveriti |
| **Operable** | Vmesnik mora biti uporabljiv | ⚠️ Preveriti |
| **Understandable** | Vsebina in UI razumljiva | ✅ Slovenski jezik |
| **Robust** | Kompatibilen z asistivno tehnologijo | ⚠️ Preveriti |

---

## 2. Accessibility Checklist

### 2.1 Keyboard Navigation

| Element | Status | Opomba |
|---------|--------|--------|
| Vsi interaktivni elementi dosegljivi s Tab | ⚠️ Preveriti | |
| Logičen tab red | ⚠️ Preveriti | |
| Skip-to-content link | ❌ Manjka | Dodati |
| Focus vidno prikazan | ⚠️ Preveriti | |
| Modal focus trap | ⚠️ Preveriti | |
| Escape zapre modale | ⚠️ Preveriti | |
| Enter/Space aktivira gumbe | ✅ | HTML default |

**Skip-to-content implementacija:**

```tsx
// src/components/skip-link.tsx
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
    >
      Preskoči na vsebino
    </a>
  );
}

// V layout.tsx:
<SkipLink />
<main id="main-content">...</main>
```

### 2.2 Focus Management

| Aspekt | Status | Implementacija |
|--------|--------|----------------|
| Focus vidno (outline) | ⚠️ | `focus-visible:ring-2 focus-visible:ring-ring` |
| Modal focus trap | ⚠️ | Radix Dialog ima vgrajeno |
| Focus restore po modal close | ⚠️ | Radix Dialog ima vgrajeno |
| Focus na error v formi | ❌ | Dodati |

### 2.3 Color Contrast

| Element | Zahteva (AA) | Status |
|---------|--------------|--------|
| Body text | 4.5:1 | ✅ text-foreground na bg-background |
| Large text (18pt+) | 3:1 | ✅ |
| UI components | 3:1 | ✅ |
| Links | 4.5:1 | ⚠️ Preveriti |
| Placeholder text | 4.5:1 | ⚠️ Preveriti |

**Test orodja:**
- axe DevTools (Chrome extension)
- Lighthouse Accessibility audit
- WebAIM Contrast Checker

### 2.4 ARIA Labels

| Element | Status | Opomba |
|---------|--------|--------|
| Slike imajo alt text | ✅ | Vse slike imajo alt |
| Ikone imajo aria-label | ⚠️ Preveriti | |
| Gumbovi imajo aria-label | ⚠️ Preveriti | |
| Form inputs imajo label | ✅ | |
| Modal ima aria-labelledby | ✅ | Radix |
| Modal ima aria-describedby | ✅ | Radix |
| Live regions (toast) | ✅ | aria-live="polite" |
| Loading states | ⚠️ | aria-busy="true" |

### 2.5 Semantic HTML

| Element | Status |
|---------|--------|
| `<main>` | ✅ |
| `<header>` | ✅ |
| `<nav>` | ✅ |
| `<footer>` | ✅ |
| `<article>` | ✅ |
| `<section>` | ✅ |
| `<h1>` - `<h6>` hierarhija | ⚠️ Preveriti |
| `<button>` za akcije | ✅ |
| `<a>` za navigacijo | ✅ |
| `<form>` z ustreznimi labels | ✅ |

### 2.6 Images

| Aspekt | Status |
|---------|--------|
| Vse slike imajo alt text | ✅ |
| Dekorativne slike: alt="" | ⚠️ Preveriti |
| Complex slike: long description | N/A |
| Icons: aria-label ali aria-hidden | ⚠️ Preveriti |

### 2.7 Forms

| Aspekt | Status |
|---------|--------|
| Vsi inputi imajo `<label>` | ✅ |
| Error messages povezani z input | ⚠️ Preveriti |
| Required polja označena | ✅ |
| Autocomplete atributi | ✅ |
| Input types (email, tel, url) | ✅ |

### 2.8 Mobile Accessibility

| Aspekt | Status |
|---------|--------|
| Touch targeti min 44px | ⚠️ Preveriti |
| Pinch zoom ni onemogočen | ✅ |
| Responsive design | ✅ |
| Horizontal scroll ne | ✅ |

### 2.9 Dynamic Content

| Aspekt | Status |
|---------|--------|
| Toast notifications aria-live | ✅ |
| Loading states aria-busy | ⚠️ |
| Error states aria-invalid | ⚠️ |
| Dynamic content announce | ⚠️ |

---

## 3. Testiranje

### 3.1 Avtomatsko testiranje

```bash
# Lighthouse audit (v browserju)
# Chrome DevTools > Lighthouse > Accessibility

# axe DevTools (Chrome extension)
# Namesti in zaženi na vsaki strani

# Pa11y (CLI)
npx pa11y http://localhost:3000/
npx pa11y http://localhost:3000/destinacija/bled
npx pa11y http://localhost:3000/owner/dashboard
```

### 3.2 Ročno testiranje

#### Keyboard test
1. Odpri vsako stran
2. Navigiraj samo s Tab/Shift+Tab
3. Preveri da lahko dosežeš vse funkcionalnosti
4. Preveri da je focus vedno vidno prikazan
5. Preveri da Escape zapre modale

#### Screen reader test
1. Namesti NVDA (Windows) ali VoiceOver (Mac)
2. Odpri vsako stran
3. Navigiraj s puščicami
4. Preveri da so vsi elementi oznanjeni
5. Preveri da so error-jii oznanjeni

#### Mobile test
1. Odpri v Chrome mobile simulation
2. Preveri touch targete (min 44px)
3. Preveri da ni horizontal scroll
4. Preveri forms (pravi input type)

### 3.3 Test strani

| Stran | Lighthouse score | axe issues | Ročno test |
|-------|------------------|-----------|-----------|
| Homepage | ⚠️ | ⚠️ | ⚠️ |
| /destinacija/bled | ⚠️ | ⚠️ | ⚠️ |
| /destinacija/bled/things-to-do | ⚠️ | ⚠️ | ⚠️ |
| /owner/dashboard | ⚠️ | ⚠️ | ⚠️ |
| /admin | ⚠️ | ⚠️ | ⚠️ |
| /o-strani | ⚠️ | ⚠️ | ⚠️ |
| /kontakt | ⚠️ | ⚠️ | ⚠️ |

**Cilj:** Lighthouse Accessibility score > 90 za vse strani.

---

## 4. Known Issues (za rešiti pred deploy)

- [ ] Skip-to-content link manjka
- [ ] Loading states nimajo aria-busy
- [ ] Error states v formah nimajo aria-invalid
- [ ] Nekatere ikone nimajo aria-label
- [ ] Focus na error v formi manjka
- [ ] Modal focus trap preveriti

---

## 5. Accessibility Maintenance

| Aktivnost | Frekvenca |
|-----------|-----------|
| Lighthouse audit | Ob vsakem release |
| axe scan | Ob vsakem release |
| Keyboard test | Mesečno |
| Screen reader test | Četrtletno |
| Accessibility review | Četrtletno |

---

**Konec Accessibility Review.**

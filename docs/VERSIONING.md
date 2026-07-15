# Versioning Strategy

> **Status:** Living document
> **Datum:** 2025-01-15
> **Namen:** Jasno sledenje katera dokumentacija pripada kateri izdaji

---

## 1. Verzijska hierarhija

```
┌─────────────────────────────────────────────────────────────┐
│                    VERSIONING HIERARCHY                     │
└─────────────────────────────────────────────────────────────┘

  PRODUCT BLUEPRINT (strategic)
  ├── v1.0 (FROZEN — 2025-01-15)
  ├── v1.1 (ko product owner odobri spremembe)
  └── v2.0 (major pivot)
         │
         ▼
  TECHNICAL SPECIFICATION (implementation)
  ├── v1.0 (DRAFT — 2025-01-15)
  ├── v1.0 (FROZEN — ob začetku implementacije)
  ├── v1.1 (ko se spec spremeni)
  └── v2.0 (ko se arhitektura spremeni)
         │
         ▼
  ADR (architectural decisions)
  ├── ADR-001 to ADR-015 (v1.0 — 2025-01-15)
  ├── ADR-016 (nova odločitev)
  └── ADR-016 nadomešča ADR-005 (če se spremeni)
         │
         ▼
  RELEASE (software version)
  ├── v1.0.0 (prvi production release)
  ├── v1.0.1 (hotfix)
  ├── v1.1.0 (nova feature)
  ├── v1.2.0 (nova feature)
  └── v2.0.0 (breaking change)
```

---

## 2. Semantic Versioning (SemVer)

Format: `MAJOR.MINOR.PATCH` (npr. `1.2.3`)

| Tip | Kdaj | Primer |
|-----|------|--------|
| **MAJOR** (X.0.0) | Breaking spremembe, nepotrebne z existing data | 1.0.0 → 2.0.0 |
| **MINOR** (1.X.0) | Nova feature, backward compatible | 1.0.0 → 1.1.0 |
| **PATCH** (1.0.X) | Bug fix, backward compatible | 1.0.0 → 1.0.1 |

---

## 3. Dokumentacija verzije

### 3.1 Blueprint verzija

```markdown
# Product Blueprint v1.0
**Status:** ✅ FROZEN
**Datum:** 2025-01-15

## Spremembe od v0.9:
- Added: User Roles & Permissions
- Added: State Diagrams
- Added: Error Flows
- Added: KPI Dashboard
- Added: AI Cost Model (3 scenarios)
- Added: Launch Checklist
```

### 3.2 Ko se Blueprint spremeni

```
1. Product owner predlaga spremembo
2. Ustvari se ADR (če je arhitekturna)
3. Blueprint se posodobi na v1.1 (ali v2.0 če major)
4. Technical Spec se posodobi
5. Nova release se izda
```

---

## 4. Release proces

### 4.1 Pred release

- [ ] Vse ADR-ji pregledani
- [ ] Technical Spec posodobljen
- [ ] CHANGELOG.md posodobljen
- [ ] Version bump v package.json
- [ ] Tag v Git (`v1.0.0`)
- [ ] Release notes napisane

### 4.2 Release notes template

```markdown
# Release v1.0.0 — 2025-01-XX

## ✨ New Features
- AI itinerar z multi-turn refinement
- AI chatbot z dostopom do baze
- Naravnojezikovno iskanje
- AI priporočila z 24h cache
- Owner dashboard z AI insights
- Admin dashboard z approval queue
- Sponsorship management
- Stripe checkout za premium/enterprise

## 🐛 Bug Fixes
- (none — first release)

## ⚠️ Breaking Changes
- (none — first release)

## 📚 Documentation
- Product Blueprint v1.0
- Technical Specification v1.0
- 15 ADR-jev
- Risk Register
- Data Flow Document
- Observability Plan

## 🚀 Deployment
- Vercel
- Custom domain: discoverslovenia.ai
- Turso (DB)
- Stripe (payments)
```

### 4.3 Tag v Git

```bash
git tag -a v1.0.0 -m "Release v1.0.0 — Initial production release"
git push origin v1.0.0
```

---

## 5. CHANGELOG.md

```markdown
# Changelog

Vse pomembne spremembe so dokumentirane tukaj.
Format temelji na [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Database migration strategy
- Seed strategy (dev/demo/prod)
- Feature flags
- Backup recovery test plan
- Security review
- Accessibility review
- Incident playbook
- Versioning strategy

## [1.0.0] — 2025-01-XX

### Added
- Discover Slovenia AI platforma (initial release)
- 9 AI funkcij (itinerar, chat, search, priporočila, POI, tag, insights, FAQ, prevodi)
- 25 lokalov, 28 izdelkov, 28 izkušenj
- Owner dashboard (5 tabov)
- Admin dashboard (5 tabov)
- 322 SEO landing pages
- 4 jeziki (sl/en/de/it)
- Stripe checkout (demo mode)
- Programmatic SEO
- AI ranking z utežmi 60/20/10/10
- Transparency badges (sponsored/affiliate)
```

---

## 6. Version compatibility matrix

| Blueprint | Tech Spec | ADR | Release | Status |
|-----------|----------|-----|---------|--------|
| v1.0 | v1.0 | ADR-001 to ADR-015 | v1.0.0 | 🚧 In development |
| v1.0 | v1.0 | + ADR-016 | v1.1.0 | 🔮 Planned |

---

## 7. Pravila

1. **Blueprint je FROZEN** — spremembe zahtevajo product owner odobritev
2. **Technical Spec spremlja Blueprint** — če se Blueprint spremeni, Spec tudi
3. **ADR-ji so immutabilni** — nova odločitev = nov ADR ki referencira starega
4. **Release = Git tag** — vsaka release ima tag v Git
5. **CHANGELOG** — vsaka release ima changelog entry
6. **Backward compatibility** — MINOR in PATCH ne lomijo existing data
7. **Migration path** — vsaka MAJOR release ima migration guide

---

**Konec Versioning Strategy.**

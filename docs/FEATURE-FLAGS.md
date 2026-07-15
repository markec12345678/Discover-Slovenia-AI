# Feature Flags

> **Status:** Living document
> **Datum:** 2025-01-15
> **Namen:** Postopno vklop/izklop funkcij brez novih deployev

---

## 1. Implementacija

### 1.1 Enostavna rešitev (env-based)

```typescript
// src/lib/feature-flags.ts

type FeatureFlag =
  | "AI_CHAT_ENABLED"
  | "AI_SEARCH_ENABLED"
  | "AI_REFINE_ENABLED"
  | "AI_RECOMMENDATIONS_ENABLED"
  | "SPONSORED_RESULTS_ENABLED"
  | "BETA_ENABLED"
  | "PAYMENTS_ENABLED"
  | "MULTI_TURN_ITINERARY_ENABLED"
  | "OWNER_DASHBOARD_ENABLED"
  | "ADMIN_DASHBOARD_ENABLED"
  | "AUTO_TAGGING_ENABLED"
  | "AI_INSIGHTS_ENABLED"
  | "POI_AI_DESCRIPTIONS_ENABLED"
  | "SEO_FAQ_ENABLED";

const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
  AI_CHAT_ENABLED: true,
  AI_SEARCH_ENABLED: true,
  AI_REFINE_ENABLED: true,
  AI_RECOMMENDATIONS_ENABLED: true,
  SPONSORED_RESULTS_ENABLED: true,
  BETA_ENABLED: true,
  PAYMENTS_ENABLED: false, // dokler ni Stripe konfiguriran
  MULTI_TURN_ITINERARY_ENABLED: true,
  OWNER_DASHBOARD_ENABLED: true,
  ADMIN_DASHBOARD_ENABLED: true,
  AUTO_TAGGING_ENABLED: true,
  AI_INSIGHTS_ENABLED: true,
  POI_AI_DESCRIPTIONS_ENABLED: true,
  SEO_FAQ_ENABLED: true,
};

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  // 1. Preveri env (override)
  const envValue = process.env[`FEATURE_${flag}`];
  if (envValue === "true") return true;
  if (envValue === "false") return false;

  // 2. Fallback na default
  return DEFAULT_FLAGS[flag];
}

// Za client-side (preko Next.js public env)
export function getPublicFeatureFlags(): Record<string, boolean> {
  return {
    AI_CHAT_ENABLED: isFeatureEnabled("AI_CHAT_ENABLED"),
    AI_SEARCH_ENABLED: isFeatureEnabled("AI_SEARCH_ENABLED"),
    BETA_ENABLED: isFeatureEnabled("BETA_ENABLED"),
    PAYMENTS_ENABLED: isFeatureEnabled("PAYMENTS_ENABLED"),
    MULTI_TURN_ITINERARY_ENABLED: isFeatureEnabled("MULTI_TURN_ITINERARY_ENABLED"),
  };
}
```

### 1.2 Client-side uporaba

```typescript
// src/lib/feature-flags-client.ts

import { useEffect, useState } from "react";

let cachedFlags: Record<string, boolean> | null = null;

export async function fetchFeatureFlags(): Promise<Record<string, boolean>> {
  if (cachedFlags) return cachedFlags;

  const res = await fetch("/api/feature-flags");
  const data = await res.json();
  cachedFlags = data.flags;
  return cachedFlags;
}

export function useFeatureFlag(flag: string): boolean {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    fetchFeatureFlags().then((flags) => {
      setEnabled(flags[flag] ?? false);
    });
  }, [flag]);

  return enabled ?? false;
}
```

### 1.3 API endpoint

```typescript
// src/app/api/feature-flags/route.ts

import { NextResponse } from "next/server";
import { getPublicFeatureFlags } from "@/lib/feature-flags";

export async function GET() {
  return NextResponse.json({
    flags: getPublicFeatureFlags(),
  });
}
```

---

## 2. Seznam feature flagov

| Flag | Default | Opis | Kdaj vklopiti |
|------|---------|------|--------------|
| `AI_CHAT_ENABLED` | true | AI chatbot na homepage | Po testiranju |
| `AI_SEARCH_ENABLED` | true | Naravnojezikovno iskanje | Po testiranju |
| `AI_REFINE_ENABLED` | true | Multi-turn itinerar refinement | Po testiranju |
| `AI_RECOMMENDATIONS_ENABLED` | true | AI priporočila v tržnici | Po testiranju |
| `SPONSORED_RESULTS_ENABLED` | true | Sponzorirani rezultati v AI | Ko imamo premium providerje |
| `BETA_ENABLED` | true | Beta banner + brezplačni model | Do 30 lokalov |
| `PAYMENTS_ENABLED` | **false** | Stripe checkout | Ko je Stripe konfiguriran |
| `MULTI_TURN_ITINERARY_ENABLED` | true | Multi-turn refinement UI | Po testiranju |
| `OWNER_DASHBOARD_ENABLED` | true | Owner dashboard dostopen | Po testiranju |
| `ADMIN_DASHBOARD_ENABLED` | true | Admin dashboard dostopen | Po testiranju |
| `AUTO_TAGGING_ENABLED` | true | AI auto-tagging za lastnike | Po testiranju |
| `AI_INSIGHTS_ENABLED` | true | AI vpogledi v dashboardih | Po testiranju |
| `POI_AI_DESCRIPTIONS_ENABLED` | true | AI opisi za POI | Po testiranju |
| `SEO_FAQ_ENABLED` | true | AI FAQ za SEO | Po testiranju |

---

## 3. Uporaba v komponentah

```typescript
// Primer: Chatbot component
import { useFeatureFlag } from "@/lib/feature-flags-client";

export function Chatbot() {
  const chatEnabled = useFeatureFlag("AI_CHAT_ENABLED");

  if (!chatEnabled) return null;

  return <ChatbotUI />;
}
```

```typescript
// Primer: Server-side check
import { isFeatureEnabled } from "@/lib/feature-flags";

export async function POST(request: Request) {
  if (!isFeatureEnabled("PAYMENTS_ENABLED")) {
    return NextResponse.json(
      { error: "Plačila še niso na voljo" },
      { status: 503 }
    );
  }

  // ... checkout logic
}
```

---

## 4. Environment override

```bash
# .env (production primer)
FEATURE_PAYMENTS_ENABLED=true
FEATURE_BETA_ENABLED=false  # ko preneha beta
FEATURE_AI_CHAT_ENABLED=false  # začasno izklop če AI odpove
```

---

## 5. Flag lifecycle

```
1. DODAJ flag (default: false)
   └── Feature še v razvoju

2. TESTIRAJ na staging (env override)
   └── FEATURE_X=true

3. VKLOPI v produkciji (env)
   └── Default ostane false, env = true

4. POENOSTAVI (po 1 mesecu stabilnosti)
   └── Default = true, odstrani env override

5. ODSTRANI flag (po 3 mesecih)
   └── Koda vedno izvaja feature
```

---

**Konec Feature Flags.**

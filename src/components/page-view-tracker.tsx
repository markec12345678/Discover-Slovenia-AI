"use client";

import * as React from "react";

// Client-side komponenta, ki ob vstopu na stran beleži PageView preko
// /api/admin/track-pageview. Beleži samo enkrat na mount (ne ob re-renderih).
//
// Uporaba: <PageViewTracker path="/destinacija/bled/guide/romanticni-pobeg" title="..." />
export function PageViewTracker({
  path,
  title,
}: {
  path: string;
  title?: string;
}) {
  const tracked = React.useRef(false);

  React.useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    let referrer: string | undefined;
    try {
      referrer = document.referrer || undefined;
    } catch {
      referrer = undefined;
    }

    fetch("/api/admin/track-pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, title, referrer }),
      keepalive: true,
    }).catch(() => {
      // tiho ignoriraj napake — ne lomi uporabniške izkušnje
    });
  }, [path, title]);

  return null;
}

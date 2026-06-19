import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Next-intl navigation helperji — uporabljajo se namesto `next/navigation`
 * za locale-aware navigacijo (Link, useRouter, usePathname, redirect).
 *
 * `router.push(path, { locale })` samodejno doda/odstrani locale prefix
 * glede na `localePrefix: "as-needed"` konfiguracijo.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

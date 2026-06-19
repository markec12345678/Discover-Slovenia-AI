import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

/**
 * Server component, ki pridobi prevode (messages) na serverju in jih
 * posreduje `NextIntlClientProvider`-ju. Tako lahko client komponente
 * (Navigation, LanguageSwitcher, ...) uporabljajo `useTranslations` hook.
 *
 * Brez tega provider-ja `useTranslations` ne deluje v client komponentah,
 * ker prevodi niso na voljo v client bundle-u.
 */
export async function IntlProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

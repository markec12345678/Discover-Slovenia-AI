"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Calendar,
  Clock,
  ArrowRight,
  BookOpen,
  MapPin,
  User,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { enGB, sl } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  BLOG_POSTS,
  BLOG_CATEGORIES,
  getPostsByCategory,
  type BlogCategory,
  type BlogPost,
} from "@/lib/blog-data";
import {
  BLOG_POSTS_EN,
  BLOG_CATEGORIES_EN,
  getPostsByCategoryEn,
} from "@/lib/blog-data-en";
import { getDestinationById } from "@/lib/slovenia-data";
import { getEnDestination } from "@/lib/slovenia-data-en";
import { Link } from "@/i18n/navigation";

/**
 * BlogSection — blog članki s filtriranjem po kategoriji in modalom.
 * "use client" zaradi filtrov (Tabs) in modala (Dialog state).
 *
 * TASK 32 (Tier 1 #5): komponenta je zdaj dvojezična — na /en/vodici izriše
 * EN prevode člankov (BLOG_POSTS_EN, istih 16 slugov kot SL — pariteto
 * varuje task32-blog-en.test.ts), na SL poti pa nespremenjeno slovensko
 * množico. UI nizi prihajajo iz t("blogSection") (parity v obeh jezikih);
 * oznake kategorij so podatkovno vezane (isti vir resnice kot vodiki).
 */

const CATEGORY_BADGE_CLASS: Record<BlogCategory, string> = {
  narava: "bg-primary text-primary-foreground",
  kulinarika: "bg-amber-500 text-amber-950",
  kultura: "bg-accent text-accent-foreground",
  avantura: "bg-rose-600 text-white",
  nasveti: "bg-emerald-700 text-white",
};

/** Oznaka kategorije iz podatkovne plasti (SL ali EN množice). */
function categoryLabel(category: BlogCategory, locale: string): string {
  const list = locale === "en" ? BLOG_CATEGORIES_EN : BLOG_CATEGORIES;
  return list.find((c) => c.value === category)?.label ?? category;
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return locale === "en"
    ? format(date, "d MMM yyyy", { locale: enGB })
    : format(date, "d. MMM yyyy", { locale: sl });
}

export function BlogSection() {
  const locale = useLocale();
  const t = useTranslations("blogSection");
  const isEn = locale === "en";
  const [category, setCategory] = useState<BlogCategory | "all">("all");
  const [activePost, setActivePost] = useState<BlogPost | null>(null);

  const categories = isEn ? BLOG_CATEGORIES_EN : BLOG_CATEGORIES;

  const filtered = useMemo(
    () =>
      isEn ? getPostsByCategoryEn(category) : getPostsByCategory(category),
    [category, isEn]
  );

  return (
    <section
      id="blog"
      className="scroll-mt-20 bg-muted/30 py-16 sm:py-20"
      aria-labelledby="blog-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="outline"
            className="mb-3 border-primary/30 text-primary"
          >
            <BookOpen className="mr-1 size-3.5" aria-hidden="true" />
            {t("badge")}
          </Badge>
          <h2
            id="blog-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {t("title")}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {t("intro")}
          </p>
        </div>

        {/* Filter tabs */}
        <div className="mt-8 flex justify-center">
          <Tabs
            value={category}
            onValueChange={(v) => setCategory(v as BlogCategory | "all")}
            className="w-full max-w-3xl"
          >
            <TabsList className="flex w-full flex-wrap justify-center h-auto">
              {categories.map((c) => (
                <TabsTrigger
                  key={c.value}
                  value={c.value}
                  className="flex-1 min-w-[80px]"
                >
                  {c.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Grid mreža */}
        {filtered.length === 0 ? (
          <BlogEmptyState t={t} />
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {filtered.map((post) => (
              <BlogCard
                key={post.slug}
                post={post}
                locale={locale}
                t={t}
                onOpen={() => setActivePost(post)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <BlogDialog
        post={activePost}
        locale={locale}
        t={t}
        onClose={() => setActivePost(null)}
      />
    </section>
  );
}

type BlogMessages = ReturnType<typeof useTranslations>;

function BlogCard({
  post,
  locale,
  t,
  onOpen,
}: {
  post: BlogPost;
  locale: string;
  t: BlogMessages;
  onOpen: () => void;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={t("readArticleAria", { title: post.title })}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group gap-0 overflow-hidden py-0 transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
    >
      {/* Slika */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <img
          src={post.image}
          alt={post.title}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <Badge
          className={`absolute left-3 top-3 shadow-sm ${CATEGORY_BADGE_CLASS[post.category]}`}
        >
          {categoryLabel(post.category, locale)}
        </Badge>
      </div>

      {/* Body */}
      <CardContent className="flex flex-col gap-3 p-3 sm:p-4">
        {/* Meta */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground sm:gap-3 sm:text-xs">
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" aria-hidden="true" />
            {formatDate(post.date, locale)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden="true" />
            {t("readTime", { minutes: post.readTime })}
          </span>
        </div>

        <h3 className="line-clamp-2 text-sm font-semibold leading-tight sm:text-lg">
          {post.title}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2 sm:text-sm">
          {post.excerpt}
        </p>

        {/* CTA — full-width na mobilnem za veliko tap tarčo */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-between self-start text-primary hover:bg-primary/10 hover:text-primary sm:w-auto"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {t("readMore")}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

function BlogDialog({
  post,
  locale,
  t,
  onClose,
}: {
  post: BlogPost | null;
  locale: string;
  t: BlogMessages;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={post !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {post ? (
        <DialogContent
          showCloseButton
          className="max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
          aria-describedby="blog-modal-desc"
        >
          <DialogTitle className="sr-only">{post.title}</DialogTitle>
          <DialogDescription id="blog-modal-desc" className="sr-only">
            {t("dialogDescription", { title: post.title, author: post.author })}
          </DialogDescription>

          <div className="scroll-area-custom max-h-[85vh] overflow-y-auto">
            {/* Slika */}
            <div className="relative aspect-video w-full overflow-hidden bg-muted">
              <img
                src={post.image}
                alt={post.title}
                className="size-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <Badge
                  className={`mb-2 shadow-sm ${CATEGORY_BADGE_CLASS[post.category]}`}
                >
                  {categoryLabel(post.category, locale)}
                </Badge>
                <h2 className="text-2xl font-bold leading-tight sm:text-3xl">
                  {post.title}
                </h2>
              </div>
            </div>

            {/* Meta in vsebina */}
            <article className="space-y-5 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <User className="size-3.5" aria-hidden="true" />
                  {post.author}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3.5" aria-hidden="true" />
                  {formatDate(post.date, locale)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {t("readTime", { minutes: post.readTime })}
                </span>
              </div>

              <div className="prose-blog">
                <ReactMarkdown
                  components={{
                    h2: ({ children }) => (
                      <h2 className="mt-6 mb-3 text-xl font-bold tracking-tight text-foreground first:mt-0">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="mt-5 mb-2 text-lg font-semibold text-foreground">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className="mb-4 text-sm leading-relaxed text-foreground/90">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-4 ml-5 list-disc space-y-1 text-sm leading-relaxed text-foreground/90 marker:text-primary">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-4 ml-5 list-decimal space-y-1 text-sm leading-relaxed text-foreground/90 marker:text-primary marker:font-semibold">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => <li>{children}</li>,
                    strong: ({ children }) => (
                      <strong className="font-semibold text-foreground">
                        {children}
                      </strong>
                    ),
                  }}
                >
                  {post.content}
                </ReactMarkdown>
              </div>

              {/* Povezava na destinacijo */}
              {post.relatedDestination ? (
                <RelatedDestinationLink
                  id={post.relatedDestination}
                  locale={locale}
                  t={t}
                />
              ) : null}
            </article>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function RelatedDestinationLink({
  id,
  locale,
  t,
}: {
  id: string;
  locale: string;
  t: BlogMessages;
}) {
  const destination = getDestinationById(id);
  if (!destination) return null;

  // EN overlay (TASK 32): tagline preko DESTINATIONS_EN, kjer obstaja;
  // name je lastno ime (jezikovno nevtralno) iz SL podatkov. Dve povezani
  // destinaciji (novo-mesto, murska-sobota) še nimata EN prevoda tagline-a —
  // iskren fallback na SL tagline (P4-8: nikoli izmišljanja vsebine).
  const en = locale === "en" ? getEnDestination(id) : undefined;
  const tagline =
    locale === "en" ? (en?.tagline ?? destination.tagline) : destination.tagline;

  return (
    <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
        <MapPin className="size-3.5" aria-hidden="true" />
        {t("relatedDestination")}
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {destination.name}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
        {tagline}
      </p>
      <Button
        type="button"
        size="sm"
        asChild
        className="mt-3 bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {/* i18n Link: EN uporabnik ostane na /en/destinacije */}
        <Link href="/destinacije">
          {t("exploreDestination")}
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}

function BlogEmptyState({ t }: { t: BlogMessages }) {
  return (
    <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <BookOpen className="size-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="text-base font-medium">{t("emptyTitle")}</p>
      <p className="text-sm text-muted-foreground">{t("emptyDescription")}</p>
    </div>
  );
}

export default BlogSection;

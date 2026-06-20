"use client";

import { useMemo, useState } from "react";
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
import { sl } from "date-fns/locale";
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
import { getDestinationById } from "@/lib/slovenia-data";

const CATEGORY_LABELS: Record<BlogCategory, string> = {
  narava: "Narava",
  kulinarika: "Kulinarika",
  kultura: "Kultura",
  avantura: "Avantura",
  nasveti: "Nasveti",
};

const CATEGORY_BADGE_CLASS: Record<BlogCategory, string> = {
  narava: "bg-primary text-primary-foreground",
  kulinarika: "bg-amber-500 text-amber-950",
  kultura: "bg-accent text-accent-foreground",
  avantura: "bg-rose-600 text-white",
  nasveti: "bg-emerald-700 text-white",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return format(date, "d. MMM yyyy", { locale: sl });
}

/**
 * BlogSection — slovenski blog članki s filtriranjem po kategoriji in modalom.
 * "use client" zaradi filtrov (Tabs) in modala (Dialog state).
 */
export function BlogSection() {
  const [category, setCategory] = useState<BlogCategory | "all">("all");
  const [activePost, setActivePost] = useState<BlogPost | null>(null);

  const filtered = useMemo(
    () => getPostsByCategory(category),
    [category]
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
            Blog & vodičniki
          </Badge>
          <h2
            id="blog-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Zgodbe iz Slovenije
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Vodičniki, nasveti in inspiracije za vaše naslednje potovanje
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
              {BLOG_CATEGORIES.map((c) => (
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
          <BlogEmptyState />
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((post) => (
              <BlogCard
                key={post.slug}
                post={post}
                onOpen={() => setActivePost(post)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <BlogDialog post={activePost} onClose={() => setActivePost(null)} />
    </section>
  );
}

function BlogCard({
  post,
  onOpen,
}: {
  post: BlogPost;
  onOpen: () => void;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Preberi članek: ${post.title}`}
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
          {CATEGORY_LABELS[post.category]}
        </Badge>
      </div>

      {/* Body */}
      <CardContent className="flex flex-col gap-3 p-4">
        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" aria-hidden="true" />
            {formatDate(post.date)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden="true" />
            {post.readTime} min branja
          </span>
        </div>

        <h3 className="text-lg font-semibold leading-tight line-clamp-2">
          {post.title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {post.excerpt}
        </p>

        {/* CTA */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 justify-between self-start text-primary hover:bg-primary/10 hover:text-primary"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          Preberi več
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

function BlogDialog({
  post,
  onClose,
}: {
  post: BlogPost | null;
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
            Celoten članek {post.title} avtorja {post.author}.
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
                  {CATEGORY_LABELS[post.category]}
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
                  {formatDate(post.date)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {post.readTime} min branja
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
                <RelatedDestinationLink id={post.relatedDestination} />
              ) : null}
            </article>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function RelatedDestinationLink({ id }: { id: string }) {
  const destination = getDestinationById(id);
  if (!destination) return null;

  return (
    <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
        <MapPin className="size-3.5" aria-hidden="true" />
        Povezana destinacija
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {destination.name}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
        {destination.tagline}
      </p>
      <Button
        type="button"
        size="sm"
        asChild
        className="mt-3 bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <a href="#destinacije">
          Razišči destinacijo
          <ArrowRight className="size-4" />
        </a>
      </Button>
    </div>
  );
}

function BlogEmptyState() {
  return (
    <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <BookOpen className="size-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="text-base font-medium">V tej kategoriji ni člankov.</p>
      <p className="text-sm text-muted-foreground">
        Poskusite izbrati drugo kategorijo.
      </p>
    </div>
  );
}

export default BlogSection;

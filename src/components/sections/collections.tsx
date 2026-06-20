"use client";

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { COLLECTIONS, type Collection } from "@/lib/collections";
import { CollectionModal } from "@/components/sections/collection-modal";

/**
 * CollectionsSection — kurirane zbirke za boljšo navigacijo in AI priporočila.
 * Grid 4/2/1 kolone. Klik na kartico odpre CollectionModal z rezultati.
 */
export function CollectionsSection() {
  const [active, setActive] = useState<Collection | null>(null);

  return (
    <section
      id="zbirke"
      className="scroll-mt-20 bg-muted/30 py-16 sm:py-20"
      aria-labelledby="zbirke-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3 text-primary" aria-hidden="true" />
            Kurirane kategorije
          </div>
          <h2
            id="zbirke-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Zbirke
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Kurirane kategorije za vsako priložnost — od zimskih paketov do
            romantičnih pobegov in eko lokalnih izdelkov.
          </p>
        </div>

        {/* Grid */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COLLECTIONS.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              onOpen={() => setActive(collection)}
            />
          ))}
        </div>
      </div>

      <CollectionModal
        collection={active}
        onClose={() => setActive(null)}
      />
    </section>
  );
}

function CollectionCard({
  collection,
  onOpen,
}: {
  collection: Collection;
  onOpen: () => void;
}) {
  return (
    <Card
      className="group relative cursor-pointer overflow-hidden border-border/60 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
      role="button"
      tabIndex={0}
      aria-label={`Odpri zbirko ${collection.title}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <CardContent className="flex flex-col gap-3 p-5">
        <div
          className={`flex size-12 items-center justify-center rounded-xl text-2xl ${collection.color}`}
          aria-hidden="true"
        >
          {collection.icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold leading-tight">
            {collection.title}
          </h3>
          <p className="mt-1.5 text-sm leading-snug text-muted-foreground line-clamp-2">
            {collection.description}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 h-8 w-fit gap-1.5 px-2 text-primary hover:bg-primary/10 hover:text-primary"
          tabIndex={-1}
          aria-hidden="true"
        >
          Razišči
          <ArrowRight
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Button>
      </CardContent>
    </Card>
  );
}

export default CollectionsSection;

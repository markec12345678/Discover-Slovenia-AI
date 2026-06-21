// Reusable JSON-LD schema generators za SEO

export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; url?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  };
}

export function articleJsonLd(article: {
  title: string;
  description: string;
  image: string;
  datePublished: string;
  author: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    image: article.image,
    datePublished: article.datePublished,
    author: { "@type": "Person", name: article.author },
    publisher: {
      "@type": "Organization",
      name: "I Feel Slovenia",
      logo: { "@type": "ImageObject", url: "https://ifeelslovenia.si/icon-192.png" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": article.url },
  };
}

// Helper za render JSON-LD v komponentah
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

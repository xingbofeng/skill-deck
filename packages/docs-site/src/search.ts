export type SearchSection = {
  title: string;
  hash: string;
};

export type SearchDocRecord<View extends string = string> = {
  view: View;
  title: string;
  lead: string;
  body: string;
  sections: SearchSection[];
};

export type DocSearchEntry<View extends string = string> = {
  view: View;
  title: string;
  snippet: string;
  hash?: string;
};

export function buildDocSearchIndex<View extends string>(
  docs: Record<View, { title: string; lead: string; body: string; sections: SearchSection[] }>
): SearchDocRecord<View>[] {
  return (Object.entries(docs) as Array<
    [View, { title: string; lead: string; body: string; sections: SearchSection[] }]
  >).map(([view, doc]) => ({
    view,
    title: doc.title,
    lead: doc.lead,
    body: doc.body,
    sections: doc.sections
  }));
}

export function searchDocs<View extends string>(
  index: SearchDocRecord<View>[],
  query: string
): DocSearchEntry<View>[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  return index
    .flatMap((doc) => {
      const section = doc.sections.find((item) => item.title.toLowerCase().includes(normalizedQuery));
      if (section) {
        return [
          {
            view: doc.view,
            title: section.title,
            snippet: `${doc.title} · ${section.title}`,
            hash: section.hash
          }
        ];
      }

      const text = `${doc.title}\n${doc.lead}\n${doc.body}`.toLowerCase();
      const textIndex = text.indexOf(normalizedQuery);
      if (textIndex < 0) return [];

      return [
        {
          view: doc.view,
          title: doc.title,
          snippet: `${doc.title} · ${text
            .slice(Math.max(0, textIndex - 42), textIndex + normalizedQuery.length + 84)
            .replace(/\s+/g, " ")}`
        }
      ];
    })
    .slice(0, 8);
}

import type { PageFaqItem } from '../data/page-faqs';

interface ContextualFaqProps {
  items: PageFaqItem[];
}

export function ContextualFaq({ items }: ContextualFaqProps) {
  return (
    <section className="faq contextual-faq" aria-labelledby="page-faq-title">
      <h2 id="page-faq-title">Frequently asked questions</h2>
      {items.map((item) => (
        <details key={item.question}>
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </section>
  );
}

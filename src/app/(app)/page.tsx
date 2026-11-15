import type { Metadata } from 'next';
import { Card, LinkCard } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { primaryNavigation } from '@/config/navigation';

export const metadata: Metadata = { title: 'Home' };

const destinations = primaryNavigation.filter((item) => item.href !== '/');

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Welcome to your library"
        description="Book Tracker is a private place for the books you own, what you are reading, what you take from each book and who has borrowed which copy."
      />

      <Card className="mb-10">
        <h2 className="font-serif text-lg font-semibold text-ink">An early preview</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          The layout and navigation are ready. Signing in, your books and your reading history come
          in the next milestones, so there is nothing personal here yet and nothing is being saved.
        </p>
      </Card>

      <section aria-labelledby="home-destinations">
        <SectionHeader
          id="home-destinations"
          title="Find your way around"
          description="Each part of the library has its own place. Here is what each one will hold."
        />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {destinations.map(({ href, label, icon, summary }) => (
            <li key={href}>
              <LinkCard
                href={href}
                title={label}
                description={summary}
                icon={icon}
                status="Coming soon"
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ScanLine, Ticket } from 'lucide-react';
import { eventsApi } from '@/api/endpoints';
import { Badge, ButtonLink, CountUp } from '@/components/ui';
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard';
import { AdSlot } from '@/components/ads/AdSlot';
import { SiteNav } from '@/layouts/PublicLayout';
import { useBranding } from '@/features/branding/BrandingContext';
import heroVideo from '@/assets/hero-video.mp4';

// Reference implementation of a full screen (Figma: "Web / Landing" and "Mobile / Landing").
// Use it as the pattern for the remaining pages.

const steps = [
  { icon: CalendarDays, title: 'Pick a hike', body: 'Browse upcoming events, check difficulty, meeting point and what to bring.' },
  { icon: Ticket, title: 'Get your QR ticket', body: 'Pay securely with Paystack. No account needed. Your ticket lands in your inbox.' },
  { icon: ScanLine, title: 'Check in at the trailhead', body: 'Staff scan your QR code, even offline. Your hike is added to your history.' },
];

const heroStats = [
  { value: 2480, suffix: '', label: 'Registered hikers' },
  { value: 156, suffix: '', label: 'Hikes completed' },
  { value: 92, suffix: '%', label: 'Avg. attendance rate' },
];

function HeroStats() {
  return (
    <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-6 text-white md:mt-14 md:gap-14">
      {heroStats.map(({ value, suffix, label }) => (
        <div key={label} className="flex flex-col-reverse">
          <dt className="text-sm text-white/75">{label}</dt>
          <dd className="text-[34px] font-extrabold tabular-nums">
            <CountUp value={value} suffix={suffix} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function Landing() {
  const { name: brand, bannerUrl } = useBranding();
  const { data: events = [], isLoading } = useQuery({ queryKey: ['events'], queryFn: eventsApi.list });

  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-screen min-h-[100svh] flex-col overflow-hidden bg-pine">
        <video
          className="pointer-events-none absolute inset-0 size-full object-cover object-center"
          src={heroVideo}
          poster={bannerUrl || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-pine/65 via-pine/30 to-pine/60" />
        <SiteNav />
        <div className="container-page relative flex flex-1 flex-col justify-center pb-12 pt-28 md:pb-16 md:pt-32">
          <Badge tone="orange" className="self-start">Next hike · {events[0]?.title ?? 'coming soon'}</Badge>
          <h1 className="mt-6 text-5xl leading-[1.05] text-white md:text-7xl">
            Find your trail.<br /><span className="text-sun-soft">Walk it together.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/85">
            Weekly guided hikes around Abuja and beyond. Book in seconds, get a QR ticket, and build a record of every trail you finish.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <ButtonLink to="/events" variant="accent" size="lg">Browse hikes</ButtonLink>
            <ButtonLink to="/signup" variant="light" size="lg">Create account</ButtonLink>
          </div>
          <HeroStats />
        </div>
      </section>

      {/* Upcoming hikes (WEB-002) */}
      <section className="container-page py-20">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-4xl">Upcoming hikes</h2>
            <p className="mt-2 text-slate">Published events with open tickets. Spots go fast.</p>
          </div>
          <Link to="/events" className="font-semibold text-forest">View all events →</Link>
        </div>
        <div className="mt-10 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <EventCardSkeleton key={i} />)
            : events.slice(0, 3).map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      </section>

      {/* Homepage ad placement (WEB-004, ADS-007..012) */}
      <section className="container-page">
        <AdSlot placement="homepage_banner" />
      </section>

      {/* How it works */}
      <section className="container-page py-20">
        <h2 className="text-center text-4xl">How {brand} works</h2>
        <p className="mt-2 text-center text-slate">Three steps from your sofa to the summit.</p>
        <div className="mt-12 grid gap-7 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="card p-7">
              <span className="grid size-14 place-items-center rounded-2xl bg-mint text-forest"><Icon size={22} /></span>
              <p className="mt-8 text-[13px] font-bold text-sun-dark">0{i + 1}</p>
              <h3 className="mt-1 text-[21px] font-bold">{title}</h3>
              <p className="mt-2 text-sm text-slate">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container-page pb-20">
        <div className="rounded-3xl bg-forest p-10 md:p-14">
          <h2 className="text-3xl text-white md:text-[38px]">Your next summit is waiting.</h2>
          <p className="mt-3 text-mist-light">Join 2,480 hikers who walk with {brand} every weekend.</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <ButtonLink to="/signup" variant="accent" size="lg">Create free account</ButtonLink>
            <ButtonLink to="/events" variant="light" size="lg">See events</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

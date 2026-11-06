import { Background } from "@/components/background";
import { WhyThisExists } from "@/components/blocks/about";
import { AboutHero } from "@/components/blocks/about-hero";
import { DashedLine } from "@/components/dashed-line";
import { JsonLd, personSchema } from "@/components/site/json-ld";

export const metadata = {
  title: { absolute: "Why Dev Agent exists | Dev Agent" },
  description:
    "How Dev Agent turns browser design changes into focused coding-agent instructions.",
  keywords: [
    "Dev Agent",
    "browser visual editor",
    "Dev Agent local MCP",
    "open source design tool",
    "why Dev Agent",
  ],
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    title: "Why Dev Agent exists | Dev Agent",
    description:
      "How Dev Agent turns browser design changes into focused coding-agent instructions.",
    url: "/about",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Dev Agent — The visual editor for all your agent’s work",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Why Dev Agent exists | Dev Agent",
    description:
      "How Dev Agent turns browser design changes into focused coding-agent instructions.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Dev Agent — The visual editor for all your agent’s work",
      },
    ],
  },
};

export default function AboutPage() {
  return (
    <>
      <JsonLd data={personSchema} />
      {/* Hero — yellow background slab */}
      <Background>
        <section className="py-12 lg:py-16">
          <AboutHero />
        </section>
      </Background>

      {/* Why this exists — yellow background slab */}
      <Background variant="bottom">
        <section className="py-20 lg:py-28">
          <DashedLine className="container max-w-5xl" />
          <div className="mt-16">
            <WhyThisExists />
          </div>
        </section>
      </Background>
    </>
  );
}

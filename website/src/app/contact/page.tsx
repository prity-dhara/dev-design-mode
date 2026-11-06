import React from "react";

import { Background } from "@/components/background";
import {
  ContactChannels,
  ContactHero,
  ContactReports,
} from "@/components/blocks/contact";
import { DashedLine } from "@/components/dashed-line";

export const metadata = {
  title: { absolute: "Contact and support | Dev Agent" },
  description:
    "Get in touch about Dev Agent — GitHub issues, local MCP guidance, and security disclosure. Bug or feature idea?",
  keywords: [
    "Dev Agent contact",
    "bug report Dev Agent",
    "Dev Agent support",
    "Dev Agent security disclosure",
  ],
  alternates: { canonical: "/contact" },
  openGraph: {
    type: "website",
    title: "Contact and support | Dev Agent",
    description:
      "Get in touch about Dev Agent — GitHub issues, local MCP guidance, and security disclosure. Bug or feature idea?",
    url: "/contact",
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
    title: "Contact and support | Dev Agent",
    description:
      "Get in touch about Dev Agent — GitHub issues, local MCP guidance, and security disclosure. Bug or feature idea?",
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

const Page = () => {
  return (
    <>
      {/* Hero — yellow background slab */}
      <Background>
        <section className="py-12 lg:py-16">
          <ContactHero />
        </section>
      </Background>

      {/* Middle — channels */}
      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />
        <div className="mt-12">
          <ContactChannels />
        </div>
      </section>

      {/* Bottom — reports + security in yellow slab */}
      <Background variant="bottom">
        <section className="py-20 lg:py-28">
          <DashedLine className="container max-w-5xl" />
          <div className="mt-16">
            <ContactReports />
          </div>
        </section>
      </Background>
    </>
  );
};

export default Page;

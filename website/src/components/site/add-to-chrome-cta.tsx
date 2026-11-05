"use client";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import { useInstallTarget } from "@/hooks/use-install-target";
import {
  CHROME_WEB_STORE_URL,
  FIREFOX_AMO_URL,
  SAFARI_RELEASE_URL,
} from "@/lib/install-links";
import { withNavRef } from "@/lib/nav-ref";
import { cn } from "@/lib/utils";

// Browser-aware source-install CTA. Dev Agent is not published in browser
// stores yet; all destinations lead to this repository's install guide.
// Keep the exported component name for existing call sites.

const STORES = {
  chrome: {
    name: "Chrome",
    label: "Install Dev Agent from source",
    href: withNavRef(CHROME_WEB_STORE_URL),
    icon: "/chrome.svg",
    event: "add_to_chrome",
  },
  firefox: {
    name: "Firefox",
    label: "Install Dev Agent from source",
    href: withNavRef(FIREFOX_AMO_URL),
    icon: "/firefox.svg",
    event: "add_to_firefox",
  },
  safari: {
    name: "Safari",
    label: "Install Dev Agent from source",
    href: SAFARI_RELEASE_URL,
    icon: "/safari.svg",
    event: "download_safari",
  },
} as const;

type GtagFn = (
  command: "event",
  action: string,
  params: Record<string, unknown>,
) => void;

function trackCtaClick(cta: string) {
  const w = window as unknown as { gtag?: GtagFn };
  if (w.gtag) w.gtag("event", "cta_click", { cta });
}

export function AddToChromeCta({
  size = "default",
  label,
  className,
  iconSize = 16,
}: {
  size?: "default" | "sm" | "lg";
  label?: string;
  className?: string;
  iconSize?: number;
}) {
  const store = STORES[useInstallTarget()];
  return (
    <Button asChild size={size} className={cn("gap-2", className)}>
      <a
        href={store.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackCtaClick(store.event)}
      >
        <Image
          src={store.icon}
          width={iconSize}
          height={iconSize}
          alt=""
          aria-hidden="true"
          className="shrink-0"
        />
        {label ?? store.label}
      </a>
    </Button>
  );
}

// No separate browser-store listing exists for this Dev Agent fork yet.
// Avoid showing an icon that sends users to the original extension.
export function OtherStoreLink(_props: { className?: string }) {
  return null;
}

export const metadata = {
  title: { absolute: "Privacy — Extension storage, Cloud relay and analytics" },
  description:
    "How Dev Agent stores browser edits, when Cloud or Local MCP traffic starts, what the relay retains, and which analytics events the website sends.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    type: "website",
    title: "Privacy — Extension storage, Cloud relay and analytics",
    description:
      "How Dev Agent stores browser edits, when Cloud or Local MCP traffic starts, what the relay retains, and which analytics events the website sends.",
    url: "/privacy",
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
    title: "Privacy — Extension storage, Cloud relay and analytics",
    description:
      "How Dev Agent stores browser edits, when Cloud or Local MCP traffic starts, what the relay retains, and which analytics events the website sends.",
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

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

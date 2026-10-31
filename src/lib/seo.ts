import { CONTACT_EMAIL } from "@/lib/contact";

export const SITE_URL = "https://nykst.unifies.codes";
export const SITE_NAME = "Nykst";
export const SITE_DESCRIPTION =
  "One map of how your repository fits together, built from its real code. See what a change will touch before you make it.";
export const SHARE_IMAGE = `${SITE_URL}/og-image.png`;

export function canonicalUrl(path: string) {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

export function shareMeta(args: {
  title: string;
  description: string;
  path: string;
  imageAlt?: string;
}) {
  return [
    { property: "og:title", content: args.title },
    { property: "og:description", content: args.description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonicalUrl(args.path) },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:image", content: SHARE_IMAGE },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    {
      property: "og:image:alt",
      content: args.imageAlt ?? "A real Nykst system map built from this repository",
    },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: args.title },
    { name: "twitter:description", content: args.description },
    { name: "twitter:image", content: SHARE_IMAGE },
    {
      name: "twitter:image:alt",
      content: args.imageAlt ?? "A real Nykst system map built from this repository",
    },
  ];
}

export const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  email: CONTACT_EMAIL,
  description:
    "Nykst builds a read-only map of a software repository and shows what a change will affect before it is made.",
  sameAs: ["https://github.com/flawsom/nykst"],
};

export const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  description: SITE_DESCRIPTION,
};

export function articleLd(args: {
  title: string;
  description: string;
  path: string;
  published: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: args.title,
    description: args.description,
    url: canonicalUrl(args.path),
    mainEntityOfPage: canonicalUrl(args.path),
    datePublished: args.published,
    dateModified: args.published,
    author: { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/` },
    publisher: { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/` },
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/` },
  };
}

export const softwareApplicationLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  url: `${SITE_URL}/`,
  description: SITE_DESCRIPTION,
  offers: [
    {
      "@type": "Offer",
      name: "Monthly",
      price: "699",
      priceCurrency: "INR",
      url: `${SITE_URL}/subscribe`,
      description: "Monthly plan. Prices include 18 percent GST. 7-day trial.",
    },
    {
      "@type": "Offer",
      name: "Annual",
      price: "4999",
      priceCurrency: "INR",
      url: `${SITE_URL}/subscribe`,
      description: "Annual plan. Prices include 18 percent GST. 7-day trial.",
    },
  ],
};

// Never call OpenAI or ChatGPT API directly from the frontend.
// Use the backend endpoint to keep API keys secure.

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || "http://localhost:8000";

export type ProductOption = {
  id: string;
  title: string;
  description: string;
  addOns?: string[];
};

export type CountryProductConfigEntry = {
  destinationCountry: string;
  acknowledgement?: string;
  products: ProductOption[];
};

// Country-specific product catalogs. Each country shows ONLY the products listed here.
export const countryProductConfig: Record<string, CountryProductConfigEntry> = {
  Germany: {
    destinationCountry: "Germany",
    acknowledgement: "I understand that the notary is not from Germany",
    products: [
      {
        id: "signature_notarisation_germany",
        title: "Signature notarisation (Germany)",
        description:
          "Our partner notary will verify your identity and certify your signature on the document. As the certification is not issued by a German notary, an Apostille is required for use in Germany.",
        addOns: ["Apostille (recommended)", "Proof of Representation"],
      },
      {
        id: "certified_true_copy_germany",
        title: "Certified True Copy (Germany)",
        description:
          "A certified copy is a notarised confirmation that a copy matches the original. As the certification is not issued by a German notary, an Apostille is required for use in Germany.",
        addOns: ["Apostille (recommended)"],
      },
    ],
  },

  India: {
    destinationCountry: "India",
    products: [
      {
        id: "signature_notarisation_india",
        title: "Signature notarisation",
        description:
          "Our partner notary will verify your identity and certify your signature on the document.",
        addOns: ["Apostille", "Proof of Representation"],
      },
      {
        id: "certified_copy_india",
        title: "Certified copy",
        description:
          "A certified copy is a notarised confirmation that a copy matches the original.",
        addOns: ["Apostille"],
      },
    ],
  },

  Austria: {
    destinationCountry: "Austria",
    products: [
      { id: "change_managing_director_gmbh_austria", title: "Change Managing Director (GmbH)", description: "Change the Managing Director of a Limited Liability Company (GmbH)." },
      { id: "liquidation_gmbh_austria", title: "Liquidation of a Limited Liability Company (GmbH)", description: "Liquidate a Limited Liability Company (GmbH)." },
      { id: "notarisation_for_ivf_austria", title: "Notarisation for IVF", description: "Notarise documents required for IVF treatment." },
      { id: "real_estate_purchase_agreement_austria", title: "Real Estate Purchase Agreement", description: "Notarise a Real Estate Purchase Agreement." },
      { id: "change_registered_seat_gmbh_austria", title: "change of the registered seat of a GmbH", description: "Change the registered seat of a GmbH in the company register." },
      { id: "commercial_register_application_austria", title: "Commercial Register Application", description: "Notarise an entry in the commercial register." },
      { id: "incorporation_flexco_austria", title: "Incorporation FlexCo", description: "Incorporate an Austrian FlexCo." },
      { id: "incorporation_gmbh_austria", title: "Incorporation Limited Liability Company", description: "Incorporate an Austrian Limited Liability Company (GmbH)." },
      { id: "general_partnership_og_austria", title: "General Partnership (OG)", description: "Incorporate an Austrian General Partnership (OG)." },
      { id: "letter_of_hypothecation_austria", title: "Letter of Hypothecation", description: "Notarise a Letter of Hypothecation." },
      { id: "power_of_attorney_austria", title: "Power of Attorney", description: "A Power of Attorney is a notarized document that grants authority to act on someone’s behalf." },
      { id: "signature_notarisation_austria", title: "Signature Notarisation", description: "Signature notarisation is a notarised confirmation that a signature is genuine." },
      { id: "transfer_of_shares_gmbh_austria", title: "Transfer of Shares (GmbH)", description: "Transfer the shares of a limited liability company (GmbH)." },
      { id: "other_austria", title: "Other", description: "Please describe in the remarks what you need." },
    ],
  },

  Spain: {
    destinationCountry: "Spain",
    products: [
      { id: "signature_notarisation_spain", title: "Signature notarisation", description: "Our partner notary will verify your identity and certify your signature on the document.", addOns: ["Apostille", "Proof of Representation"] },
      { id: "certified_copy_spain", title: "Certified copy", description: "A certified copy is a notarised confirmation that a copy matches the original.", addOns: ["Apostille"] },
      
    ],
  },

  Sweden: {
    destinationCountry: "Sweden",
    products: [
      { id: "signature_notarisation_sweden", title: "Signature notarisation", description: "Our partner notary will verify your identity and certify your signature on the document.", addOns: ["Apostille", "Proof of Representation"] },
      { id: "certified_copy_sweden", title: "Certified copy", description: "A certified copy is a notarised confirmation that a copy matches the original.", addOns: ["Apostille"] },
      
    ],
  },

  "United States of America": {
    destinationCountry: "United States of America",
    products: [
      { id: "signature_notarisation_usa", title: "Signature notarisation", description: "Our partner notary will verify your identity and certify your signature on the document.", addOns: ["Apostille", "Proof of Representation"] },
      { id: "certified_copy_usa", title: "Certified copy", description: "A certified copy is a notarised confirmation that a copy matches the original.", addOns: ["Apostille"] },
      
    ],
  },

  "United Arab Emirates": {
    destinationCountry: "United Arab Emirates",
    products: [
      { id: "signature_notarisation_uae", title: "Signature notarisation", description: "Our partner notary will verify your identity and certify your signature on the document.", addOns: ["Apostille", "Proof of Representation"] },
      { id: "certified_copy_uae", title: "Certified copy", description: "A certified copy is a notarised confirmation that a copy matches the original.", addOns: ["Apostille"] },
      
    ],
  },

  Pakistan: {
    destinationCountry: "Pakistan",
    products: [
      { id: "signature_notarisation_pakistan", title: "Signature notarisation", description: "Our partner notary will verify your identity and certify your signature on the document.", addOns: ["Apostille", "Proof of Representation"] },
      { id: "certified_copy_pakistan", title: "Certified copy", description: "A certified copy is a notarised confirmation that a copy matches the original.", addOns: ["Apostille"] },
      
    ],
  },
};

export const countryAliases: Record<string, string> = {
  USA: "United States of America",
  "United States": "United States of America",
  "United States of America": "United States of America",
  UAE: "United Arab Emirates",
  "United Arab Emirates": "United Arab Emirates",
};

export function normalizeCountryName(country: string): string {
  if (!country) return country;
  return countryAliases[country] || country;
}

export function getProductsForCountry(country: string): ProductOption[] {
  const cfg = countryProductConfig[normalizeCountryName(country)];
  return cfg?.products ?? [];
}
export const COUNTRIES: { name: string; flag: string }[] = [
  { name: "Austria", flag: "🇦🇹" },
  { name: "Germany", flag: "🇩🇪" },
  { name: "Sweden", flag: "🇸🇪" },
  { name: "India", flag: "🇮🇳" },
];
// Full searchable country list. The four cards above are quick suggestions only.
export const COUNTRY_OPTIONS: string[] = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia",
  "Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium",
  "Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei",
  "Bulgaria","Burkina Faso","Cambodia","Cameroon","Canada","Chile","China","Colombia",
  "Costa Rica","Croatia","Cyprus","Czech Republic","Denmark","Dominican Republic","Ecuador",
  "Egypt","Estonia","Ethiopia","Finland","France","Georgia","Germany","Ghana","Greece",
  "Guatemala","Hong Kong","Hungary","Iceland","India","Indonesia","Ireland","Israel","Italy",
  "Japan","Jordan","Kazakhstan","Kenya","Kuwait","Latvia","Lebanon","Liechtenstein",
  "Lithuania","Luxembourg","Malaysia","Malta","Mexico","Monaco","Montenegro","Morocco",
  "Netherlands","New Zealand","Nigeria","North Macedonia","Norway","Oman","Pakistan",
  "Panama","Peru","Philippines","Poland","Portugal","Qatar","Romania","Saudi Arabia",
  "Serbia","Singapore","Slovakia","Slovenia","South Africa","South Korea","Spain",
  "Sri Lanka","Sweden","Switzerland","Thailand","Turkey","Ukraine","United Arab Emirates",
  "United Kingdom","United States","Uruguay","Vietnam",
];

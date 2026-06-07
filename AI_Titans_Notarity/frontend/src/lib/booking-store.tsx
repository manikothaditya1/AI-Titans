import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type SelectedDocument = {
  id: string;
  productId: string;
  productTitle: string;
  fileName?: string;
  detectedDocumentType?: string;
  destinationCountry?: string;
  addOns?: string[];
  answers: Record<string, string>;
};

export type AnalysedDocumentSummary = {
  documentId: string;
  fileName: string;
  detectedDocumentType: string;
  recommendedProduct: string;
  recommendedProductId: string;
  countryOfUse: string;
  signersDetected: number;
  language: string;
  confidence: number;
  missingDetails: string[];
};

export type Participant = {
  id: string;
  email: string;
  role: "signer" | "viewer" | "company_representative";
  needsToSign: boolean;
};

export type ContactDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  isCompany: boolean;
  companyName: string;
  companyAddress: string;
  vatNumber: string;
  phoneCountryCode: string;
  phoneNumber: string;
  street: string;
  apartment: string;
  city: string;
  stateRegion: string;
  zipCode: string;
  country: string;
};

export type BillingDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  isCompany: boolean;
  companyName: string;
  billingEmail: string;
  billingAddress: string;
  vatNumber: string;
  phoneCountryCode: string;
  phoneNumber: string;
  street: string;
  apartment: string;
  city: string;
  stateRegion: string;
  zipCode: string;
  country: string;
};

export type BookingDraft = {
  bookingId: string;
  hasDocument: boolean | null;
  product: string;
  documentType: string;
  documentLanguage: string;
  countryOfUse: string;
  receivingAuthority: string;
  apostille: string;
  participants: string;
  signer1: string;
  signer2: string;
  identityVerification: string;
  deliveryMethod: string;
  shippingAddress: string;
  billingMethod: string;
  billingCompanyName: string;
  billingEmail: string;
  billingAddress: string;
  billingVat: string;
  mode: string;
  slot: string;
  slotDate: string;
  slotTime: string;
  timezone: string;
  notary: string;
  language: string;
  appointmentLanguage: string;
  termsAccepted: boolean;
  consents: {
    video: boolean;
    identity: boolean;
    data: boolean;
    accuracy: boolean;
  };
  selectedDocuments: SelectedDocument[];
  participantsList: Participant[];
  contactDetails: ContactDetails;
  billingDetails: BillingDetails;
  sameContactAsBilling: boolean;
  analysedDocuments: AnalysedDocumentSummary[];
};

const emptyContact: ContactDetails = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  isCompany: false,
  companyName: "",
  companyAddress: "",
  vatNumber: "",
  phoneCountryCode: "",
  phoneNumber: "",
  street: "",
  apartment: "",
  city: "",
  stateRegion: "",
  zipCode: "",
  country: "",
};

const emptyBilling: BillingDetails = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  isCompany: false,
  companyName: "",
  billingEmail: "",
  billingAddress: "",
  vatNumber: "",
  phoneCountryCode: "",
  phoneNumber: "",
  street: "",
  apartment: "",
  city: "",
  stateRegion: "",
  zipCode: "",
  country: "",
};

const empty: BookingDraft = {
  bookingId: "",
  hasDocument: null,
  product: "",
  documentType: "",
  documentLanguage: "",
  countryOfUse: "",
  receivingAuthority: "",
  apostille: "",
  participants: "",
  signer1: "",
  signer2: "",
  identityVerification: "Pending",
  deliveryMethod: "",
  shippingAddress: "",
  billingMethod: "",
  billingCompanyName: "",
  billingEmail: "",
  billingAddress: "",
  billingVat: "",
  mode: "",
  slot: "",
  slotDate: "",
  slotTime: "",
  timezone: "Europe/Vienna",
  notary: "",
  language: "",
  appointmentLanguage: "",
  termsAccepted: false,
  consents: { video: false, identity: false, data: false, accuracy: false },
  selectedDocuments: [],
  participantsList: [],
  contactDetails: emptyContact,
  billingDetails: emptyBilling,
  sameContactAsBilling: true,
  analysedDocuments: [],
};

type BookingPatch = Omit<
  Partial<BookingDraft>,
  "consents" | "contactDetails" | "billingDetails"
> & {
  consents?: Partial<BookingDraft["consents"]>;
  contactDetails?: Partial<ContactDetails>;
  billingDetails?: Partial<BillingDetails>;
};

type Ctx = {
  draft: BookingDraft;
  update: (patch: BookingPatch) => void;
  reset: () => void;
};

const BookingContext = createContext<Ctx | null>(null);

const KEY = "notarity_draft_v2";

export function BookingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<BookingDraft>(empty);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        setDraft({
          ...empty,
          ...parsed,
          consents: { ...empty.consents, ...(parsed.consents ?? {}) },
          contactDetails: { ...emptyContact, ...(parsed.contactDetails ?? {}) },
          billingDetails: { ...emptyBilling, ...(parsed.billingDetails ?? {}) },
          selectedDocuments: parsed.selectedDocuments ?? [],
          participantsList: parsed.participantsList ?? [],
          analysedDocuments: parsed.analysedDocuments ?? [],
        });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, [draft]);

  const update = (patch: BookingPatch) =>
    setDraft((d) => ({
      ...d,
      ...patch,
      consents: { ...d.consents, ...(patch.consents ?? {}) },
      contactDetails: { ...d.contactDetails, ...(patch.contactDetails ?? {}) },
      billingDetails: { ...d.billingDetails, ...(patch.billingDetails ?? {}) },
    }));
  const reset = () => setDraft(empty);

  return <BookingContext.Provider value={{ draft, update, reset }}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used inside BookingProvider");
  return ctx;
}

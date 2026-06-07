import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { SummaryPanel } from "@/components/SummaryPanel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useBooking, type BillingDetails, type ContactDetails } from "@/lib/booking-store";
import { ArrowLeft, ArrowRight, UserRound } from "lucide-react";
import { PhoneInput } from "@/components/PhoneInput";
import { UnderlineInput, UnderlineCountrySelect } from "@/components/AddressFields";
import { useState } from "react";


export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing details — Notarity" }] }),
  component: BillingPage,
});

const MOCK_PROFILE = {
  firstName: "Aditya",
  lastName: "Manikoth",
  email: "manikothaditya5@gmail.com",
  phoneCountryCode: "+43",
  phoneNumber: "677 64781406",
  street: "Carretera del Puiol del Pui 79",
  apartment: "",
  city: "La Massana",
  stateRegion: "La Massana",
  zipCode: "AD400",
  country: "Andorra",
  isCompany: false,
  companyName: "",
  vatNumber: "",
};

type AnyDetails = BillingDetails | ContactDetails;

type AddressSuggestion = {
  id?: string;
  street?: string;
  city?: string;
  zipcode?: string;
  state?: string;
  province?: string;
  country?: string;
  label?: string;
};

function getAddressSuggestions(data: any): AddressSuggestion[] {
  const suggestions =
    data?.data?.results ||
    data?.data?.suggestions ||
    data?.results ||
    data?.suggestions ||
    data?.items ||
    [];

  return Array.isArray(suggestions) ? suggestions : [];
}


function isFilled(v: string | undefined) {
  return Boolean(v && v.trim());
}

function detailsValid(d: AnyDetails) {
  return (
    isFilled(d.firstName) &&
    isFilled(d.lastName) &&
    /^\S+@\S+\.\S+$/.test(d.email) &&
    isFilled(d.phoneNumber) &&
    isFilled(d.street) &&
    isFilled(d.city) &&
    isFilled(d.zipCode) &&
    isFilled(d.country)
  );
}

/**
 * Notarity-style form section used for both billing and contact details.
 */
function DetailsForm({
  values,
  onPatch,
  onCopyFromProfile,
  helper,
  countryOfUse,
}: {
  values: AnyDetails;
  onPatch: (patch: Partial<AnyDetails>) => void;
  onCopyFromProfile: () => void;
  helper: string;
  countryOfUse?: string;
}) {
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);

  const fetchAddressSuggestions = async (value: string) => {
    if (value.trim().length < 2) {
      setAddressSuggestions([]);
      return;
    }

    const selectedCountry = countryOfUse || values.country || "Austria";

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/autocomplete-address?q=${encodeURIComponent(value)}&country=${encodeURIComponent(selectedCountry)}`
      );

      if (!response.ok) {
        setAddressSuggestions([]);
        return;
      }

      const data = await response.json();
      setAddressSuggestions(getAddressSuggestions(data));
    } catch (error) {
      console.error("Address autocomplete failed:", error);
      setAddressSuggestions([]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onCopyFromProfile}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary hover:text-secondary/80"
        >
          <UserRound className="h-3.5 w-3.5" /> Copy from my profile
        </button>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </div>

      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <UnderlineInput
          label="First name"
          value={values.firstName}
          onChange={(v) => onPatch({ firstName: v })}
        />
        <UnderlineInput
          label="Last name"
          value={values.lastName}
          onChange={(v) => onPatch({ lastName: v })}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={values.isCompany}
          onCheckedChange={(v) => onPatch({ isCompany: Boolean(v) })}
        />
        Company / Organization
      </label>

      {values.isCompany && (
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <UnderlineInput
            label="Company name"
            value={values.companyName}
            onChange={(v) => onPatch({ companyName: v })}
          />
          <UnderlineInput
            label="VAT number"
            optional
            value={values.vatNumber}
            onChange={(v) => onPatch({ vatNumber: v })}
          />
        </div>
      )}

      <UnderlineInput
        label="Email address"
        type="email"
        value={values.email}
        onChange={(v) => onPatch({ email: v })}
        placeholder="name@example.com"
      />

      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Phone number
        </span>
        <PhoneInput
          countryCode={values.phoneCountryCode || "+43"}
          number={values.phoneNumber}
          onCountryChange={(c) => onPatch({ phoneCountryCode: c })}
          onNumberChange={(n) => onPatch({ phoneNumber: n })}
        />
      </div>

      <div className="space-y-5">
        <div className="relative">
          <UnderlineInput
            label="Street and house number"
            value={values.street}
            onChange={(v) => {
              onPatch({ street: v });
              fetchAddressSuggestions(v);
            }}
          />

          {addressSuggestions.length > 0 && (
            <div className="absolute z-50 mt-2 w-full rounded-md border bg-white shadow-lg">
              {addressSuggestions.map((item, index) => {
                const street = item.street || item.label || "";
                const cityLine = [item.zipcode, item.city].filter(Boolean).join(" ");
                const region = item.state || item.province || "";
                const country = item.country || values.country || "";

                return (
                  <button
                    key={item.id || `${street}-${index}`}
                    type="button"
                    className="block w-full px-4 py-3 text-left hover:bg-gray-100"
                    onClick={() => {
                      onPatch({
                        street,
                        city: item.city || "",
                        zipCode: item.zipcode || "",
                        stateRegion: region,
                        country,
                      });

                      setAddressSuggestions([]);
                    }}
                  >
                    <div className="font-medium">{street}</div>
                    <div className="text-sm text-gray-500">
                      {[cityLine, country].filter(Boolean).join(", ")}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <UnderlineInput
          label="Apartment, suite, etc."
          optional
          value={values.apartment}
          onChange={(v) => onPatch({ apartment: v })}
        />
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <UnderlineInput
            label="City"
            value={values.city}
            onChange={(v) => onPatch({ city: v })}
          />
          <UnderlineInput
            label="State / Province / Region"
            optional
            value={values.stateRegion}
            onChange={(v) => onPatch({ stateRegion: v })}
          />
          <UnderlineInput
            label="ZIP-Code"
            value={values.zipCode}
            onChange={(v) => onPatch({ zipCode: v })}
          />
          <UnderlineCountrySelect
            label="Country"
            value={values.country}
            onChange={(v) => onPatch({ country: v })}
          />
        </div>
      </div>
    </div>
  );
}

function BillingPage() {
  const navigate = useNavigate();
  const { draft, update } = useBooking();
  const b = draft.billingDetails;
  const c = draft.contactDetails;

  const setB = (patch: Partial<BillingDetails>) => update({ billingDetails: patch });
  const setC = (patch: Partial<ContactDetails>) => update({ contactDetails: patch });

  const fillFromProfile = () => ({
    firstName: MOCK_PROFILE.firstName,
    lastName: MOCK_PROFILE.lastName,
    email: MOCK_PROFILE.email,
    phoneCountryCode: MOCK_PROFILE.phoneCountryCode,
    phoneNumber: MOCK_PROFILE.phoneNumber,
    street: MOCK_PROFILE.street,
    apartment: MOCK_PROFILE.apartment,
    city: MOCK_PROFILE.city,
    stateRegion: MOCK_PROFILE.stateRegion,
    zipCode: MOCK_PROFILE.zipCode,
    country: MOCK_PROFILE.country,
    isCompany: MOCK_PROFILE.isCompany,
    companyName: MOCK_PROFILE.companyName,
    vatNumber: MOCK_PROFILE.vatNumber,
  });

  const onSameToggle = (checked: boolean) => {
    update({ sameContactAsBilling: checked });
    if (checked) syncContactFromBilling(b);
  };

  const syncContactFromBilling = (src: BillingDetails) => {
    update({
      contactDetails: {
        firstName: src.firstName,
        lastName: src.lastName,
        email: src.email,
        phone: src.phone,
        address: src.billingAddress || src.address,
        isCompany: src.isCompany,
        companyName: src.companyName,
        companyAddress: src.billingAddress,
        vatNumber: src.vatNumber,
        phoneCountryCode: src.phoneCountryCode,
        phoneNumber: src.phoneNumber,
        street: src.street,
        apartment: src.apartment,
        city: src.city,
        stateRegion: src.stateRegion,
        zipCode: src.zipCode,
        country: src.country,
      },
    });
  };

  const billingValid = detailsValid(b);
  const contactValid = detailsValid(c);
  const isValid = draft.sameContactAsBilling ? billingValid : billingValid && contactValid;

  const handleContinue = () => {
    if (draft.sameContactAsBilling) syncContactFromBilling(b);
    navigate({ to: "/review" });
  };

  return (
    <AppShell right={<SummaryPanel />}>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Billing details</h1>

        <div className="mt-8">
          <DetailsForm
            values={b}
            onPatch={(patch) => setB(patch as Partial<BillingDetails>)}
            onCopyFromProfile={() => setB(fillFromProfile())}
            helper="Please provide your billing details"
            countryOfUse={draft.countryOfUse}
          />

        </div>

        <div className="mt-10 border-t border-border pt-8">
          <h2 className="text-2xl font-semibold tracking-tight">Contact details</h2>
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={draft.sameContactAsBilling}
              onCheckedChange={(v) => onSameToggle(Boolean(v))}
            />
            Contact details are the same as the billing details
          </label>

          {!draft.sameContactAsBilling && (
            <div className="mt-6">
              <DetailsForm
                values={c}
                onPatch={(patch) => setC(patch as Partial<ContactDetails>)}
                onCopyFromProfile={() => setC(fillFromProfile())}
                helper="Please provide your contact details"
                countryOfUse={draft.countryOfUse}
              />
            </div>
          )}
        </div>

        <div className="mt-10 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate({ to: "/validation" })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <Button
            disabled={!isValid}
            onClick={handleContinue}
            className="bg-brand hover:bg-brand/90"
          >
            Continue to review <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

export const BILLING_LABELS: Record<string, string> = {
  online_payment: "Online payment",
  pay_at_appointment: "Pay at appointment",
  // legacy values from older drafts — kept only so persisted state shows readable text
  pay_online: "Online payment",
};

export function billingLabel(value: string): string {
  return BILLING_LABELS[value] ?? value;
}

export const APOSTILLE_LABELS: Record<string, string> = {
  yes: "Yes, add apostille",
  no: "No apostille needed",
};

export function apostilleLabel(value: string): string {
  return APOSTILLE_LABELS[value] ?? value;
}

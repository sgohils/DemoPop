export const OFFERS = {
  package: {
    name: "Launch package",
    dollars: 29,
    projects: 1,
    recurring: false,
  },
  studio: { name: "Studio", dollars: 79, projects: 5, recurring: true },
} as const;
export type Offer = keyof typeof OFFERS;
export const PROJECT_ACCESS_DAYS = 30;
export const PROJECT_EXPORT_LIMIT = 10;
export const FREE_EXPORT_LIMIT = 2;
export type FreeExportSummary = {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
};
export function freeExportPeriod(now = new Date()) {
  return {
    startsAt: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString(),
    resetsAt: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).toISOString(),
  };
}
export type BillingSummary = {
  enabled: boolean;
  available: boolean;
  signedIn: boolean;
  remaining: number;
  free: FreeExportSummary;
  canManageBilling: boolean;
  subscription: { status: string; cancelAtPeriodEnd: boolean } | null;
  projects: {
    id: string;
    name: string;
    expiresAt: string;
    exportsUsed: number;
  }[];
};
export const PAYMENT_REQUIRED =
  "Choose a launch package or Studio plan to export this project. Your edits are saved.";

export function isOffer(value: unknown): value is Offer {
  return value === "package" || value === "studio";
}

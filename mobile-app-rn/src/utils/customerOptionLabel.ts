import { Customer, CustomerOnboardingStatus } from '../api/customers';
import { useLocale } from '../i18n/LocaleContext';

type LocaleT = ReturnType<typeof useLocale>['t'];

// Mirrors the onboardingStatusLabel helper in ClientFormScreen -- reuses
// the 'onboarding' section's status* translation keys.
function onboardingStatusLabel(t: LocaleT, status: CustomerOnboardingStatus): string {
  return t('onboarding', `status${capitalize(status.replace(/_./g, (m) => m[1].toUpperCase()))}` as any);
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A customer picker option label that flags anything other than
 * 'active' onboarding right in the list -- previously these pickers
 * showed names only, so a salesman had no way to notice a customer was
 * on hold/rejected/still pending before quoting or ordering for them. */
export function customerOptionLabel(t: LocaleT, customer: Customer): string {
  if (customer.onboarding_status === 'active') return customer.name;
  return `${customer.name} — ${onboardingStatusLabel(t, customer.onboarding_status)}`;
}

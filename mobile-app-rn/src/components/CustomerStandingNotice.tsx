import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBadge } from './StatusBadge';
import { fonts, whiteAlpha } from '../theme';
import { useLocale } from '../i18n/LocaleContext';
import { Customer, CustomerCreditStatus, CustomerOnboardingStatus, getCustomerCredit } from '../api/customers';

type LocaleT = ReturnType<typeof useLocale>['t'];

// Mirrors the onboardingStatusLabel helper in ClientFormScreen -- keeps
// the same translation keys ('onboarding' section's status* entries) as
// the one place onboarding status is otherwise shown.
function onboardingStatusLabel(t: LocaleT, status: CustomerOnboardingStatus): string {
  return t('onboarding', `status${capitalize(status.replace(/_./g, (m) => m[1].toUpperCase()))}` as any);
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function onboardingWarningKey(status: CustomerOnboardingStatus): 'onboardingPending' | 'onboardingUnderReview' | 'onboardingOnHold' | 'onboardingRejected' | null {
  switch (status) {
    case 'pending':
      return 'onboardingPending';
    case 'under_review':
      return 'onboardingUnderReview';
    case 'on_hold':
      return 'onboardingOnHold';
    case 'rejected':
      return 'onboardingRejected';
    default:
      return null;
  }
}

/** Surfaces a customer's onboarding standing and credit standing right
 * where a quotation/order is actually being created -- previously the
 * customer picker on those screens showed names only, so a salesman
 * could walk a customer on hold/rejected/unverified all the way through
 * a quotation and order with zero indication anything was wrong (that
 * only showed up on the separate client detail screen, or as a 409 at
 * order-confirm time -- see order_service.change_status). Renders
 * nothing when the customer's standing is unremarkable. */
export function CustomerStandingNotice({ customer }: { customer: Customer }) {
  const { t } = useLocale();
  const [credit, setCredit] = useState<CustomerCreditStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCredit(null);
    // Best-effort -- a failed credit lookup just means the credit half
    // of this notice doesn't show, not that the screen should error out.
    getCustomerCredit(customer.id)
      .then((c) => {
        if (!cancelled) setCredit(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  const onboardingKey = onboardingWarningKey(customer.onboarding_status);
  const idNotVerified = Boolean(credit?.limit_enforced && !credit.id_verified);
  const overLimit = Boolean(credit?.limit_enforced && credit.id_verified && credit.available_credit !== null && credit.available_credit <= 0);

  if (!onboardingKey && !idNotVerified && !overLimit) return null;

  return (
    <View style={styles.box}>
      <View style={styles.badgeRow}>
        <StatusBadge status={customer.onboarding_status} label={onboardingStatusLabel(t, customer.onboarding_status)} />
      </View>
      {onboardingKey && <Text style={styles.warningText}>{t('customerStanding', onboardingKey)}</Text>}
      {onboardingKey && customer.onboarding_reason && (
        <Text style={styles.reasonText}>{t('customerStanding', 'reasonPrefix', { reason: customer.onboarding_reason })}</Text>
      )}
      {idNotVerified && <Text style={styles.warningText}>{t('customerStanding', 'idNotVerifiedWarning')}</Text>}
      {overLimit && credit && (
        <Text style={styles.warningText}>
          {t('customerStanding', 'overLimitWarning', {
            outstanding: credit.outstanding_balance.toFixed(2),
            limit: credit.credit_limit.toFixed(2),
          })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  badgeRow: { flexDirection: 'row' },
  warningText: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.75), lineHeight: 17 },
  reasonText: { fontFamily: fonts.sans, fontSize: 12, color: whiteAlpha(0.5), lineHeight: 17 },
});

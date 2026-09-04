'use client';

import Link from 'next/link';
import { Avatar, Card } from '../../components/ui';
import { Chevron } from '../../components/icons';
import { ROUTES } from '../../components/shell';
import { usePreferences } from '../../lib/preferences';
import { useStore } from '../../lib/store';

/**
 * A person can belong to several companies with a different role in each, so
 * this step exists even while ADITUM is the only one loaded.
 */
export default function ChooseCompanyPage() {
  const { t } = usePreferences();
  const { company, currentMembership } = useStore();

  return (
    <div className="tn-ground min-h-dvh px-4 pt-[max(env(safe-area-inset-top),74px)]">
      <h1 className="px-1 pt-6 text-[34px] font-bold tracking-[0.2px] text-[var(--ink)]">
        {t.auth.chooseCompany}
      </h1>
      <p className="px-1 pb-5 text-[15px] text-[var(--sec)]">{t.auth.chooseCompanySub}</p>

      <Card className="overflow-hidden">
        <Link
          href={ROUTES.today}
          className="tn-press flex min-h-11 items-center gap-3.5 p-4"
        >
          <Avatar initials={company.name.charAt(0)} />
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-semibold text-[var(--ink)]">{company.name}</div>
            <div className="text-[15px] text-[var(--sec)]">
              {t.auth.role}: {currentMembership.roleTitle}
            </div>
          </div>
          <span className="text-[var(--ter)]">
            <Chevron />
          </span>
        </Link>
      </Card>

      <p className="px-5 pt-3.5 text-[13px] leading-snug text-[var(--ter)]">
        {t.auth.inviteHint}
      </p>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Card, PrimaryButton } from '../../components/ui';
import { CompanyMark, CompanySwitcherSheet } from '../../components/company-switcher';
import { Chevron } from '../../components/icons';
import { ROUTES } from '../../components/shell';
import { usePreferences } from '../../lib/preferences';
import { useStore } from '../../lib/store';

/**
 * A person can belong to several companies with a different role in each, so
 * this lists all of them rather than assuming there is one.
 */
export default function ChooseCompanyPage() {
  const router = useRouter();
  const { t, locale } = usePreferences();
  const store = useStore();
  const [creating, setCreating] = useState(false);

  if (!store.ready) return null;

  const open = (companyId: string) => {
    store.switchCompany(companyId);
    router.push(ROUTES.today);
  };

  return (
    <div className="tn-ground min-h-dvh px-4 pb-10 pt-[max(env(safe-area-inset-top),74px)]">
      <div className="mx-auto w-full max-w-[560px]">
        <h1 className="px-1 pt-6 text-[34px] font-bold tracking-[0.2px] text-[var(--ink)]">
          {t.auth.chooseCompany}
        </h1>
        <p className="px-1 pb-5 text-[15px] text-[var(--sec)]">{t.auth.chooseCompanySub}</p>

        <Card className="overflow-hidden">
          {store.companyList.length === 0 ? (
            <p className="px-4 py-4 text-[15px] text-[var(--ter)]">
              {locale === 'es' ? 'Todavía no hay ninguna.' : 'None yet.'}
            </p>
          ) : (
            store.companyList.map((row, index) => (
              <button
                key={row.id}
                type="button"
                onClick={() => open(row.id)}
                className={`tn-press flex min-h-11 w-full items-center gap-3.5 p-4 text-left ${
                  index === store.companyList.length - 1 ? '' : 'tn-hairline'
                }`}
              >
                <CompanyMark name={row.companyName} logoUrl={row.logoUrl} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold text-[var(--ink)]">
                    {row.companyName}
                  </span>
                  <span className="block text-[15px] text-[var(--sec)]">
                    {t.auth.role}: {row.roleTitle}
                  </span>
                </span>
                <span className="text-[var(--ter)]">
                  <Chevron />
                </span>
              </button>
            ))
          )}
        </Card>

        {store.canFound ? (
          <div className="mt-4">
            <PrimaryButton onClick={() => setCreating(true)}>
              {locale === 'es' ? 'Crear otra empresa' : 'Create another company'}
            </PrimaryButton>
          </div>
        ) : null}

        <p className="px-5 pt-3.5 text-[13px] leading-snug text-[var(--ter)]">
          {t.auth.inviteHint}
        </p>
      </div>

      {creating ? <CompanySwitcherSheet onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

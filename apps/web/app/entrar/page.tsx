'use client';

import { useRouter } from 'next/navigation';
import { CompassMark, GoogleMark } from '../../components/icons';
import { PrimaryButton, SecondaryButton, Segmented } from '../../components/ui';
import { usePreferences } from '../../lib/preferences';

/** Sign in. Firebase Auth (Google and email link) lands behind these buttons. */
export default function SignInPage() {
  const router = useRouter();
  const { t, locale, setLocale } = usePreferences();

  return (
    <div className="tn-ground flex min-h-dvh flex-col px-6 pb-[max(env(safe-area-inset-bottom),34px)] pt-[max(env(safe-area-inset-top),62px)]">
      <div className="flex flex-1 flex-col items-center justify-center">
        <CompassMark size={72} />
        <h1 className="mt-5 text-[28px] font-bold tracking-[-0.4px] text-[var(--ink)]">
          {t.appName}
        </h1>
        <p className="mt-2 max-w-[280px] text-center text-[17px] leading-snug text-[var(--sec)]">
          {t.promise}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-[400px] flex-col gap-3">
        <SecondaryButton onClick={() => router.push('/elegir-empresa')}>
          <GoogleMark />
          {t.auth.google}
        </SecondaryButton>

        <button
          type="button"
          onClick={() => router.push('/elegir-empresa')}
          className="tn-press flex h-[52px] items-center justify-center text-[17px] font-semibold text-[var(--accent)]"
        >
          {t.auth.emailLink}
        </button>

        <div className="mt-3 flex justify-center">
          <Segmented
            options={[
              { value: 'es' as const, label: t.settings.spanish },
              { value: 'en' as const, label: t.settings.english },
            ]}
            value={locale}
            onChange={setLocale}
          />
        </div>
      </div>
    </div>
  );
}

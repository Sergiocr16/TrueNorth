'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { CheckIcon, CompassMark } from '../../components/icons';
import { Banner, PrimaryButton, Segmented, TextButton } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { usePreferences } from '../../lib/preferences';

/**
 * Sign in with email and password.
 *
 * There is no sign-up here on purpose: accounts are created by the
 * administrator. Somebody without an account cannot make one, and somebody with
 * an account but no invitation is shown an empty app by the security rules.
 */
export default function SignInPage() {
  const router = useRouter();
  const { t, locale, setLocale } = usePreferences();
  const auth = useAuth();

  const [resetting, setResetting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // A confirmed account moves on; an unconfirmed one stays here.
  useEffect(() => {
    if (auth.user && auth.user.emailVerified) router.replace('/choose-company');
  }, [auth.user, router]);

  const es = locale === 'es';
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = resetting ? emailValid : emailValid && password.length >= 6;

  const submit = () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    const done = () => setBusy(false);
    if (resetting) void auth.resetPassword(email).finally(done);
    else void auth.signIn(email, password).finally(done);
  };

  // Signed in but the address is not confirmed: nothing else can happen yet,
  // because an unverified account cannot redeem an invitation.
  if (auth.user && !auth.user.emailVerified) {
    return (
      <Shell>
        <h1 className="mt-4 text-[22px] font-bold text-[var(--ink)]">
          {es ? 'Confirmá tu correo' : 'Confirm your email'}
        </h1>
        <p className="mt-2 max-w-[320px] text-center text-[15px] leading-snug text-[var(--sec)]">
          {es
            ? `Te mandamos un enlace a ${auth.user.email}. Abrilo y volvé acá.`
            : `We sent a link to ${auth.user.email}. Open it and come back.`}
        </p>
        {auth.notice ? (
          <div className="mt-4 w-full max-w-[400px]">
            <Banner tone="info" icon={<CheckIcon size={15} />}>
              {auth.notice}
            </Banner>
          </div>
        ) : null}
        <div className="mt-6 flex w-full max-w-[320px] flex-col gap-3">
          <PrimaryButton onClick={() => void auth.reloadUser()}>
            {es ? 'Ya lo confirmé' : 'I confirmed it'}
          </PrimaryButton>
          <TextButton onClick={() => void auth.resendVerification()}>
            {es ? 'Enviar el correo otra vez' : 'Send the email again'}
          </TextButton>
          <TextButton onClick={() => void auth.signOut()}>{t.settings.signOut}</TextButton>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="mt-4 text-[28px] font-bold tracking-[-0.4px] text-[var(--ink)]">
        {t.appName}
      </h1>
      <p className="mt-2 max-w-[290px] text-center text-[17px] leading-snug text-[var(--sec)]">
        {resetting
          ? es
            ? 'Te mandamos un enlace para elegir una contraseña nueva.'
            : 'We will send a link to choose a new password.'
          : t.promise}
      </p>

      <div className="mt-8 flex w-full max-w-[400px] flex-col gap-3">
        {!auth.configured ? (
          <Banner tone="error">
            {es
              ? 'Falta la configuración de Firebase. Copiá apps/web/.env.example a .env.local y llenalo.'
              : 'Firebase is not configured. Copy apps/web/.env.example to .env.local and fill it in.'}
          </Banner>
        ) : null}

        {auth.error ? <Banner tone="error">{auth.error}</Banner> : null}
        {auth.notice ? (
          <Banner tone="info" icon={<CheckIcon size={15} />}>
            {auth.notice}
          </Banner>
        ) : null}

        <Field
          label={es ? 'Correo' : 'Email'}
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
          placeholder="sergio@aditumcr.com"
          onEnter={submit}
        />

        {!resetting ? (
          <Field
            label={es ? 'Contraseña' : 'Password'}
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete="current-password"
            onEnter={submit}
          />
        ) : null}

        <PrimaryButton onClick={submit}>
          {busy
            ? es
              ? 'Un momento…'
              : 'One moment…'
            : resetting
              ? es
                ? 'Enviar enlace'
                : 'Send link'
              : es
                ? 'Ingresar'
                : 'Sign in'}
        </PrimaryButton>

        <div className="flex justify-center pt-1">
          <TextButton
            onClick={() => {
              auth.clearMessages();
              setResetting(!resetting);
            }}
          >
            {resetting
              ? es
                ? 'Volver a ingresar'
                : 'Back to sign in'
              : es
                ? 'Olvidé mi contraseña'
                : 'I forgot my password'}
          </TextButton>
        </div>

        <p className="px-2 text-center text-[13px] leading-snug text-[var(--ter)]">
          {es
            ? 'Las cuentas las crea el administrador. Si no tenés una, pedísela.'
            : 'Accounts are created by the administrator. If you do not have one, ask for it.'}
        </p>

        <div className="mt-2 flex justify-center">
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
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="tn-ground flex min-h-dvh flex-col items-center justify-center px-6 py-[max(env(safe-area-inset-top),48px)]">
      <CompassMark size={64} />
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
  placeholder,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
  placeholder?: string;
  onEnter?: () => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="px-1 text-[13px] font-semibold text-[var(--ter)]">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        autoCapitalize={type === 'email' ? 'none' : undefined}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onEnter?.();
        }}
        className="h-[52px] rounded-2xl border border-[var(--btn-border)] bg-[var(--surface)] px-4 text-[17px] text-[var(--ink)] outline-none placeholder:text-[var(--ter)]"
      />
    </label>
  );
}

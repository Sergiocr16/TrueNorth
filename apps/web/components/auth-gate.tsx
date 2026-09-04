'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { CompassMark } from './icons';
import { Banner, PrimaryButton } from './ui';
import { useAuth } from '../lib/auth';
import { usePreferences } from '../lib/preferences';
import { useStore } from '../lib/store';

/**
 * Everything behind sign-in goes through here. It covers the three states a
 * person can arrive in: still checking, not signed in, and signed in with no
 * company yet.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const auth = useAuth();
  const store = useStore();
  const { locale } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace('/entrar');
  }, [auth.loading, auth.user, router]);

  if (!auth.configured) {
    return (
      <Splash>
        <Banner tone="error">
          {locale === 'es'
            ? 'Falta la configuración de Firebase. Copiá apps/web/.env.example a .env.local y llenalo.'
            : 'Firebase is not configured. Copy apps/web/.env.example to .env.local and fill it in.'}
        </Banner>
      </Splash>
    );
  }

  // Checking the session, or bouncing to sign-in. Show the mark rather than a
  // flash of empty layout.
  if (auth.loading || !auth.user || !store.ready) {
    return <Splash />;
  }

  // The rules require a verified address before an invitation can be redeemed,
  // so an unconfirmed account is sent back to finish that first.
  if (!auth.user.emailVerified) {
    router.replace('/entrar');
    return <Splash />;
  }

  if (store.needsBootstrap) {
    const es = locale === 'es';

    // Somebody invited this address: joining is one tap.
    if (store.pendingInvite) {
      return (
        <Splash>
          <h1 className="text-[22px] font-bold text-[var(--ink)]">
            {es ? 'Te invitaron' : "You've been invited"}
          </h1>
          <p className="mt-2 max-w-[320px] text-center text-[15px] leading-snug text-[var(--sec)]">
            {es
              ? `${store.pendingInvite.companyName} te invitó como ${store.pendingInvite.roleTitle}.`
              : `${store.pendingInvite.companyName} invited you as ${store.pendingInvite.roleTitle}.`}
          </p>
          <div className="mt-6 w-full max-w-[280px]">
            <PrimaryButton
              onClick={() => {
                setBusy(true);
                setFailure(null);
                void store
                  .acceptInvite()
                  .catch((cause: unknown) => setFailure(explain(cause, auth.user?.email)))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? (es ? 'Un momento…' : 'One moment…') : es ? 'Entrar' : 'Join'}
            </PrimaryButton>
          </div>
          {failure ?? store.error ? (
            <div className="mt-4 w-full max-w-[380px]">
              <Banner tone="error">{failure ?? store.error}</Banner>
            </div>
          ) : null}
        </Splash>
      );
    }

    // A founder with nothing yet: create the company and its starting data.
    if (store.canFound) {
      return (
        <Splash>
          <h1 className="text-[22px] font-bold text-[var(--ink)]">
            {es ? 'Preparemos tu espacio' : "Let's set up your workspace"}
          </h1>
          <p className="mt-2 max-w-[320px] text-center text-[15px] leading-snug text-[var(--sec)]">
            {es
              ? 'Creamos tu empresa con la meta, los objetivos y los proyectos de ADITUM para que puedas empezar hoy. Todo es editable después.'
              : "We'll create your company with ADITUM's goal, objectives and projects so you can start today. Everything is editable afterwards."}
          </p>
          <div className="mt-6 w-full max-w-[280px]">
            <PrimaryButton
              onClick={() => {
                setBusy(true);
                setFailure(null);
                void store
                  .bootstrap()
                  .catch((cause: unknown) => setFailure(explain(cause, auth.user?.email)))
                  .finally(() => setBusy(false));
              }}
            >
              {busy
                ? es
                  ? 'Creando…'
                  : 'Creating…'
                : es
                  ? 'Crear mi espacio'
                  : 'Create my workspace'}
            </PrimaryButton>
          </div>
          <p className="mt-3 text-[13px] text-[var(--ter)]">{auth.user.email}</p>
          {failure ?? store.error ? (
            <div className="mt-4 w-full max-w-[380px]">
              <Banner tone="error">{failure ?? store.error}</Banner>
            </div>
          ) : null}
        </Splash>
      );
    }

    // An account with no invitation. Say so plainly rather than showing an
    // empty app: having an account is not the same as having access.
    return (
      <Splash>
        <h1 className="text-[22px] font-bold text-[var(--ink)]">
          {es ? 'Todavía no tenés acceso' : 'You do not have access yet'}
        </h1>
        <p className="mt-2 max-w-[330px] text-center text-[15px] leading-snug text-[var(--sec)]">
          {es
            ? 'Tu cuenta existe, pero nadie te ha invitado a una empresa. Pedile a alguien de adentro que comparta la suya con este correo.'
            : 'Your account exists, but nobody has invited you to a company yet. Ask someone inside to share theirs with this address.'}
        </p>
        <p className="mt-3 text-[13px] text-[var(--ter)]">{auth.user.email}</p>
        <div className="mt-6 w-full max-w-[280px]">
          <PrimaryButton onClick={() => void auth.signOut()}>
            {es ? 'Cerrar sesión' : 'Sign out'}
          </PrimaryButton>
        </div>
      </Splash>
    );
  }

  return (
    <>
      {store.error ? (
        <div className="fixed inset-x-0 top-0 z-40 p-3">
          <Banner tone="error">{store.error}</Banner>
        </div>
      ) : null}
      {children}
    </>
  );
}

/**
 * A rules rejection reaches the client as a bare "Missing or insufficient
 * permissions", which tells nobody anything. Say what it actually means here.
 */
function explain(cause: unknown, email?: string | null): string {
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String((cause as { code: unknown }).code)
      : '';
  if (code === 'permission-denied') {
    return `Firestore rechazó la escritura para ${email ?? 'esta cuenta'}. Revisá que ese correo esté en founders() dentro de firestore.rules y que las reglas estén desplegadas.`;
  }
  return cause instanceof Error ? cause.message : 'No se pudo completar la operación.';
}

function Splash({ children }: { children?: ReactNode }) {
  return (
    <div className="tn-ground flex min-h-dvh flex-col items-center justify-center px-6">
      <CompassMark size={56} />
      {children ? <div className="mt-6 flex flex-col items-center">{children}</div> : null}
    </div>
  );
}

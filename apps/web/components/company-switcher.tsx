'use client';

import { useRef, useState } from 'react';
import { EditSheet, FieldGroup, TextAreaField, TextField } from './form';
import { Overlay } from './overlay';
import { Banner } from './ui';
import { CheckIcon, ChevronDown, CloseIcon } from './icons';
import { usePreferences } from '../lib/preferences';
import { useStore } from '../lib/store';

/**
 * The company mark: the uploaded logo when there is one, the first letter
 * otherwise. Sized in one place so the switcher, the sidebar and the title
 * pill all agree.
 */
export function CompanyMark({
  name,
  logoUrl,
  size = 40,
  radius,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
  radius?: number;
}) {
  const round = radius ?? Math.round(size * 0.28);

  if (logoUrl) {
    return (
      // A logo can be any shape or colour, so it sits on a neutral tile and is
      // contained rather than cropped.
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden bg-[var(--chip-bg)]"
        style={{ width: size, height: size, borderRadius: round }}
      >
        <img
          src={logoUrl}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center bg-[var(--ink)] font-bold text-[var(--ground)]"
      style={{ width: size, height: size, borderRadius: round, fontSize: size * 0.42 }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase() || '·'}
    </span>
  );
}

/**
 * Switching between the companies a person belongs to, and creating another.
 *
 * A person can belong to several with a different role in each, so this is the
 * one control that changes what every other screen is about. It is laid out as
 * a list of destinations rather than a form: big targets, the current one
 * marked, and nothing else competing for attention.
 */
export function CompanySwitcherSheet({ onClose }: { onClose: () => void }) {
  const { t, locale } = usePreferences();
  const store = useStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [northStar, setNorthStar] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const es = locale === 'es';

  if (creating) {
    return (
      <EditSheet
        open
        title={es ? 'Nueva empresa' : 'New company'}
        onCancel={() => setCreating(false)}
        onSave={() => {
          if (!name.trim() || busy) return;
          setBusy(true);
          setFailure(null);
          void store
            .createCompany(name, northStar)
            .then(onClose)
            .catch((cause: unknown) =>
              setFailure(
                cause instanceof Error
                  ? cause.message
                  : es
                    ? 'No se pudo crear la empresa.'
                    : 'Could not create the company.',
              ),
            )
            .finally(() => setBusy(false));
        }}
        saveLabel={busy ? (es ? 'Creando…' : 'Creating…') : es ? 'Crear' : 'Create'}
        canSave={name.trim().length > 1 && !busy}
      >
        {failure ? (
          <div className="mx-4 mt-4">
            <Banner tone="error">{failure}</Banner>
          </div>
        ) : null}

        <FieldGroup
          footer={
            es
              ? 'Empieza vacía. El logo se agrega después desde Empresa.'
              : 'It starts empty. The logo is added afterwards from Company.'
          }
        >
          <TextField
            label={es ? 'Nombre' : 'Name'}
            value={name}
            onChange={setName}
            placeholder={es ? 'Mi otra empresa' : 'My other company'}
          />
          <TextAreaField
            label={t.company.northStar}
            value={northStar}
            onChange={setNorthStar}
            rows={3}
            placeholder={
              es ? 'Convertir X en Y para diciembre de 2027.' : 'Make X into Y by December 2027.'
            }
            isLast
          />
        </FieldGroup>
      </EditSheet>
    );
  }

  return (
    <Overlay>
      <div className="fixed inset-0 flex flex-col justify-end">
        <button
          type="button"
          aria-label={t.common.close}
          onClick={onClose}
          className="tn-scrim absolute inset-0"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.auth.chooseCompany}
          className="tn-sheet-in relative mx-auto flex max-h-[88dvh] w-full max-w-[520px] flex-col rounded-t-[28px] bg-[var(--ground)] pb-[max(env(safe-area-inset-bottom),20px)] sm:mb-3 sm:rounded-[28px]"
          style={{ boxShadow: '0 -8px 40px rgba(0,0,0,.35)' }}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              <h2 className="text-[22px] font-bold tracking-[-0.2px] text-[var(--ink)]">
                {t.auth.chooseCompany}
              </h2>
              <p className="mt-0.5 text-[15px] text-[var(--sec)]">{t.auth.chooseCompanySub}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.common.close}
              className="tn-press mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--chip-bg)] text-[var(--sec)]"
            >
              <CloseIcon size={13} />
            </button>
          </div>

          <div className="tn-scroll mt-4 flex-1 px-3">
            <div className="flex flex-col gap-1.5">
              {store.companyList.length === 0 ? (
                <p className="px-3 py-4 text-[15px] text-[var(--ter)]">
                  {es ? 'Todavía no hay ninguna.' : 'None yet.'}
                </p>
              ) : (
                store.companyList.map((row) => {
                  const current = row.id === store.company.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => {
                        store.switchCompany(row.id);
                        onClose();
                      }}
                      aria-current={current ? 'true' : undefined}
                      className="tn-press flex min-h-[64px] w-full items-center gap-3.5 rounded-2xl px-3 py-2.5 text-left"
                      style={{
                        background: current ? 'var(--accent-bg)' : 'var(--surface)',
                        boxShadow: current ? 'none' : 'var(--card-shadow)',
                        border: current
                          ? '1px solid var(--accent)'
                          : '1px solid transparent',
                      }}
                    >
                      <CompanyMark name={row.companyName} logoUrl={row.logoUrl} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px] font-semibold text-[var(--ink)]">
                          {row.companyName}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="truncate text-[15px] text-[var(--sec)]">
                            {row.roleTitle}
                          </span>
                          {row.access !== 'member' ? (
                            <span
                              className="rounded-full px-1.5 py-px text-[11px] font-semibold"
                              style={{ background: 'var(--chip-bg)', color: 'var(--sec)' }}
                            >
                              {row.access === 'owner'
                                ? es
                                  ? 'Propietario'
                                  : 'Owner'
                                : es
                                  ? 'Admin'
                                  : 'Admin'}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      {current ? (
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                        >
                          <CheckIcon size={13} />
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>

            {store.canFound ? (
              <button
                type="button"
                onClick={() => {
                  setName('');
                  setNorthStar('');
                  setFailure(null);
                  setCreating(true);
                }}
                className="tn-press mt-3 flex min-h-[56px] w-full items-center gap-3.5 rounded-2xl px-3 py-2.5 text-left"
                style={{ border: '1px dashed var(--btn-border)' }}
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[22px] font-semibold"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
                  aria-hidden
                >
                  +
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold text-[var(--accent)]">
                    {es ? 'Crear empresa' : 'Create company'}
                  </span>
                  <span className="block text-[13px] text-[var(--ter)]">
                    {es ? 'Empieza vacía' : 'Starts empty'}
                  </span>
                </span>
              </button>
            ) : null}

            <p className="px-3 pb-2 pt-3.5 text-[13px] leading-snug text-[var(--ter)]">
              {t.auth.inviteHint}
            </p>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

/** The pill in the large title on phones. */
export function CompanySwitcher() {
  const { company } = useStore();
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${company.name} · ${t.auth.chooseCompany}`}
        className="tn-press flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--hair)] bg-[var(--surface)] py-1.5 pl-1.5 pr-2.5"
      >
        <CompanyMark name={company.name} logoUrl={company.logoUrl} size={26} radius={8} />
        <span className="text-[var(--ter)]">
          <ChevronDown />
        </span>
      </button>
      {open ? <CompanySwitcherSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** The row at the top of the desktop sidebar. */
export function SidebarCompanyButton() {
  const { company } = useStore();
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${company.name} · ${t.auth.chooseCompany}`}
        className="tn-press mx-2 mt-3.5 flex min-h-11 items-center gap-2 rounded-xl bg-[var(--chip-bg)] px-2 py-1.5"
      >
        <CompanyMark name={company.name} logoUrl={company.logoUrl} size={24} radius={7} />
        <span className="flex-1 truncate text-left text-[13px] font-semibold text-[var(--ink)]">
          {company.name}
        </span>
        <span className="text-[var(--ter)]">
          <ChevronDown size={9} />
        </span>
      </button>
      {open ? <CompanySwitcherSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Choosing and replacing the logo. Lives on the Company screen, because the
 * logo is company data rather than a display preference.
 */
export function CompanyLogoPicker() {
  const { locale } = usePreferences();
  const store = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const es = locale === 'es';
  const { company } = store;

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setFailure(es ? 'La imagen pasa de 2 MB.' : 'The image is over 2 MB.');
      return;
    }
    setBusy(true);
    setFailure(null);
    void store
      .uploadCompanyLogo(company.id, file)
      .catch((cause: unknown) =>
        setFailure(
          cause instanceof Error
            ? cause.message
            : es
              ? 'No se pudo subir el logo.'
              : 'Could not upload the logo.',
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="tn-card mx-4 flex items-center gap-4 p-4">
      <CompanyMark name={company.name} logoUrl={company.logoUrl} size={56} />
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-semibold text-[var(--ink)]">
          {es ? 'Logo' : 'Logo'}
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-[var(--ter)]">
          {es ? 'PNG o SVG, hasta 2 MB.' : 'PNG or SVG, up to 2 MB.'}
        </p>
        {failure ? (
          <p className="mt-1.5 text-[13px] text-[var(--red)]">{failure}</p>
        ) : null}
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="tn-press text-[15px] font-semibold text-[var(--accent)]"
          >
            {busy
              ? es
                ? 'Subiendo…'
                : 'Uploading…'
              : company.logoUrl
                ? es
                  ? 'Cambiar'
                  : 'Change'
                : es
                  ? 'Subir'
                  : 'Upload'}
          </button>
          {company.logoUrl ? (
            <button
              type="button"
              onClick={() => void store.removeCompanyLogo(company.id)}
              className="tn-press text-[15px] font-semibold text-[var(--sec)]"
            >
              {es ? 'Quitar' : 'Remove'}
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        hidden
        onChange={(event) => {
          pick(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}

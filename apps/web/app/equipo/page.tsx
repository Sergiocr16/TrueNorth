'use client';

import { useState } from 'react';
import type { AccessLevel, Membership } from '@truenorth/core';
import { isOverdue } from '@truenorth/core';
import { LargeTitle, Screen } from '../../components/shell';
import { Avatar, Banner, Card, SectionLabel, TextButton } from '../../components/ui';
import {
  AddRow,
  EditSheet,
  FieldGroup,
  SelectField,
  TextAreaField,
  TextField,
} from '../../components/form';
import { usePreferences } from '../../lib/preferences';
import { useRiskCount, useStore } from '../../lib/store';

export default function TeamPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [editing, setEditing] = useState<Membership | null>(null);
  const [inviting, setInviting] = useState(false);

  const { memberships, users, tasks, today, plan } = store;

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle title={t.team.title} subtitle={store.company.name} />

      <div className="mx-4 mt-3">
        <SectionLabel>{t.team.title}</SectionLabel>
        <div className="flex flex-col gap-2.5">
          {memberships.map((membership) => {
            const user = users.find((u) => u.id === membership.userId);
            if (!user) return null;
            const own = tasks.filter(
              (task) => task.assigneeUserId === user.id && task.status !== 'done',
            );
            const overdue = own.filter((task) => isOverdue(task, today));
            const focus = membership.userId === plan.userId ? plan.headline : null;

            return (
              <Card key={membership.userId} className="p-4">
                <div className="flex items-start gap-3.5">
                  <Avatar initials={user.initials} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-semibold text-[var(--ink)]">
                      {user.displayName}
                    </div>
                    <div className="text-[15px] text-[var(--sec)]">{membership.roleTitle}</div>
                  </div>
                  <TextButton onClick={() => setEditing(membership)}>
                    {t.team.editRole}
                  </TextButton>
                </div>

                <p className="mt-2.5 text-[15px] leading-snug text-[var(--sec)]">
                  <span className="font-semibold text-[var(--ink)]">
                    {t.team.responsibility}:{' '}
                  </span>
                  {membership.roleDescription || '—'}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span
                    className="tn-tabular rounded-full px-2.5 py-1 text-[13px] font-semibold"
                    style={{ background: 'var(--chip-bg)', color: 'var(--sec)' }}
                  >
                    {own.length} {t.team.openTasks}
                  </span>
                  {overdue.length > 0 ? (
                    <span
                      className="tn-tabular rounded-full px-2.5 py-1 text-[13px] font-semibold"
                      style={{ background: 'var(--red-bg)', color: 'var(--red)' }}
                    >
                      {overdue.length} {t.team.overdueTasks}
                    </span>
                  ) : null}
                </div>

                {focus ? (
                  <p className="mt-2.5 border-t border-[var(--hair)] pt-2.5 text-[13px] leading-snug text-[var(--ter)]">
                    <span className="font-semibold">{t.team.todaysFocus}: </span>
                    {focus}
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>

      <div className="mx-4 mt-3">
        <Card className="overflow-hidden">
          <AddRow
            label={locale === 'es' ? 'Compartir con alguien' : 'Share with someone'}
            onClick={() => setInviting(true)}
          />
        </Card>
        <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">
          {locale === 'es'
            ? 'La persona necesita tener cuenta. Las cuentas las crea el administrador; vos decidís con quién compartís esta empresa.'
            : 'The person needs an account. The administrator creates accounts; you decide who you share this company with.'}
        </p>
      </div>

      {inviting ? <InviteSheet onClose={() => setInviting(false)} /> : null}

      {editing ? (
        <RoleEditor
          membership={editing}
          onCancel={() => setEditing(null)}
          onSave={(patch) => {
            store.updateMembership(editing.userId, patch);
            setEditing(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

function RoleEditor({
  membership,
  onCancel,
  onSave,
}: {
  membership: Membership;
  onCancel: () => void;
  onSave: (patch: Partial<Membership>) => void;
}) {
  const { t, locale } = usePreferences();
  const [draft, setDraft] = useState(membership);

  const accessOptions: { value: AccessLevel; label: string }[] =
    locale === 'es'
      ? [
          { value: 'owner', label: 'Propietario' },
          { value: 'admin', label: 'Administrador' },
          { value: 'member', label: 'Miembro' },
        ]
      : [
          { value: 'owner', label: 'Owner' },
          { value: 'admin', label: 'Admin' },
          { value: 'member', label: 'Member' },
        ];

  return (
    <EditSheet
      open
      title={t.team.editRole}
      onCancel={onCancel}
      onSave={() =>
        onSave({
          roleTitle: draft.roleTitle,
          roleDescription: draft.roleDescription,
          access: draft.access,
        })
      }
      canSave={draft.roleTitle.trim().length > 0}
    >
      <FieldGroup footer={t.team.roleHint}>
        <TextField
          label={t.team.roleTitle}
          value={draft.roleTitle}
          onChange={(roleTitle) => setDraft({ ...draft, roleTitle })}
          placeholder="CTO"
        />
        <TextAreaField
          label={t.team.roleDescription}
          value={draft.roleDescription}
          onChange={(roleDescription) => setDraft({ ...draft, roleDescription })}
          rows={4}
          placeholder={
            locale === 'es'
              ? 'Estabilidad de la plataforma, arquitectura, seguridad y fechas técnicas.'
              : 'Platform stability, architecture, security and technical dates.'
          }
          isLast
        />
      </FieldGroup>

      <FieldGroup>
        <SelectField
          label={locale === 'es' ? 'Permisos' : 'Access'}
          value={draft.access}
          options={accessOptions}
          onChange={(access) => setDraft({ ...draft, access })}
          isLast
        />
      </FieldGroup>
    </EditSheet>
  );
}

/** Sharing the company with somebody who already has an account. */
function InviteSheet({ onClose }: { onClose: () => void }) {
  const { t, locale } = usePreferences();
  const store = useStore();
  const [email, setEmail] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [access, setAccess] = useState<AccessLevel>('member');
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const es = locale === 'es';
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && roleTitle.trim().length > 0;
  const isAdmin = store.currentMembership.access !== 'member';

  const accessOptions: { value: AccessLevel; label: string }[] = [
    { value: 'member', label: es ? 'Miembro' : 'Member' },
    ...(isAdmin
      ? [
          { value: 'admin' as const, label: es ? 'Administrador' : 'Admin' },
          { value: 'owner' as const, label: es ? 'Propietario' : 'Owner' },
        ]
      : []),
  ];

  if (sent) {
    return (
      <EditSheet
        open
        title={es ? 'Invitación lista' : 'Invitation ready'}
        onCancel={onClose}
        cancelLabel={t.common.close}
      >
        <div className="px-6 py-8 text-center">
          <p className="text-[17px] leading-snug text-[var(--ink)]">
            {es
              ? `${email} entra a ${store.company.name} la próxima vez que ingrese.`
              : `${email} joins ${store.company.name} the next time they sign in.`}
          </p>
          <p className="mt-3 text-[15px] leading-snug text-[var(--sec)]">
            {es
              ? 'Si todavía no tiene cuenta, el administrador tiene que crearla primero en Firebase.'
              : 'If they have no account yet, the administrator has to create it in Firebase first.'}
          </p>
        </div>
      </EditSheet>
    );
  }

  return (
    <EditSheet
      open
      title={es ? 'Compartir empresa' : 'Share company'}
      onCancel={onClose}
      onSave={() => {
        if (!valid) return;
        void store
          .inviteMember(email, roleTitle, access)
          .then(() => setSent(true))
          .catch((cause: unknown) =>
            setFailed(
              cause instanceof Error
                ? cause.message
                : es
                  ? 'No se pudo crear la invitación.'
                  : 'Could not create the invitation.',
            ),
          );
      }}
      saveLabel={es ? 'Invitar' : 'Invite'}
      canSave={valid}
    >
      {failed ? (
        <div className="mx-4 mt-4">
          <Banner tone="error">{failed}</Banner>
        </div>
      ) : null}

      <FieldGroup
        footer={
          es
            ? 'Escribí el correo exacto de la cuenta. La invitación solo la puede canjear quien tenga ese correo confirmado.'
            : 'Use the exact address of the account. Only the confirmed owner of that address can redeem it.'
        }
      >
        <TextField
          label={es ? 'Correo' : 'Email'}
          value={email}
          onChange={setEmail}
          placeholder="persona@aditumcr.com"
        />
        <TextField
          label={t.team.roleTitle}
          value={roleTitle}
          onChange={setRoleTitle}
          placeholder={es ? 'Desarrollo' : 'Engineering'}
        />
        <SelectField
          label={es ? 'Permisos' : 'Access'}
          value={access}
          options={accessOptions}
          onChange={setAccess}
          isLast
        />
      </FieldGroup>
    </EditSheet>
  );
}

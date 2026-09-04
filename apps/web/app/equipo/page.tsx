'use client';

import { useState } from 'react';
import type { AccessLevel, Membership } from '@truenorth/core';
import { isOverdue, shareQuiet } from '@truenorth/core';
import { LargeTitle, Screen } from '../../components/shell';
import { Avatar, Banner, Card, SectionLabel, TextButton } from '../../components/ui';
import {
  AddRow,
  DestructiveRow,
  EditSheet,
  FieldGroup,
  SelectField,
  TextAreaField,
  TextField,
  useConfirm,
} from '../../components/form';
import { HealthCompass } from '../../components/day-compass';
import { usePreferences } from '../../lib/preferences';
import { useRiskCount, useStore } from '../../lib/store';

/**
 * The team, and the follow-up that goes with it.
 *
 * Who is on the team, what each person answers for, and what is expected of
 * them. Nothing about how they are doing: that reading, the notes about what is
 * going on with somebody, and the messages to send all live on the follow-up
 * screen, which is the manager's, not the team's.
 */
export default function TeamPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [editingRole, setEditingRole] = useState<Membership | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [inviting, setInviting] = useState(false);

  const { memberships, users, tasks, today, plan } = store;
  const isManager = store.currentMembership.access !== 'member';

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle
        title={t.team.title}
        subtitle={store.company.name}
        trailing={
          <HealthCompass
            ratio={shareQuiet(memberships.map((m) => m.userId), store.signals)}
            label={t.common.health}
          />
        }
      />

      <div className="mx-4 mt-3">
        <SectionLabel>{t.team.title}</SectionLabel>
        <div className="flex flex-col gap-2.5">
          {memberships.map((membership) => {
            const user = users.find((u) => u.id === membership.userId);
            if (!user) return null;

            const own = tasks.filter(
              (task) => task.assigneeUserIds.includes(user.id) && task.status !== 'done',
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
                    <div className="text-[15px] text-[var(--sec)]">
                      {membership.roleTitle}
                      {!membership.hasAccount ? (
                        <span className="ml-2 rounded-full bg-[var(--chip-bg)] px-2 py-0.5 text-[12px] font-semibold text-[var(--ter)]">
                          {t.team.noAccount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <TextButton onClick={() => setEditingRole(membership)}>
                    {t.team.editRole}
                  </TextButton>
                </div>

                <p className="mt-2.5 text-[15px] leading-snug text-[var(--sec)]">
                  <span className="font-semibold text-[var(--ink)]">
                    {t.team.responsibility}:{' '}
                  </span>
                  {membership.roleDescription || '—'}
                </p>

                <Expectations expectations={membership.expectations} />

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

      {/* Two different acts, kept apart on purpose: who is on the team, and
          who may open the app. Following somebody up needs the first only. */}
      {isManager ? (
        <div className="mx-4 mt-3">
          <Card className="overflow-hidden">
            <AddRow label={t.team.addPerson} onClick={() => setAddingPerson(true)} />
          </Card>
          <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">{t.team.addPersonHint}</p>
        </div>
      ) : null}

      <div className="mx-4 mt-3">
        <Card className="overflow-hidden">
          <AddRow label={t.team.shareAccess} onClick={() => setInviting(true)} />
        </Card>
        <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">
          {locale === 'es'
            ? 'La persona necesita tener cuenta. Las cuentas las crea el administrador; vos decidís con quién compartís esta empresa.'
            : 'The person needs an account. The administrator creates accounts; you decide who you share this company with.'}
        </p>
      </div>

      {inviting ? <InviteSheet onClose={() => setInviting(false)} /> : null}

      {addingPerson ? (
        <RoleEditor
          membership={{
            userId: '',
            companyId: store.company.id,
            roleTitle: '',
            roleDescription: '',
            access: 'member',
            hasAccount: false,
            expectations: '',
          }}
          displayName=""
          isNew
          onCancel={() => setAddingPerson(false)}
          onSave={(patch, displayName) => {
            store.addPerson({
              displayName: displayName ?? '',
              roleTitle: patch.roleTitle ?? '',
              roleDescription: patch.roleDescription ?? '',
              expectations: patch.expectations ?? '',
            });
            setAddingPerson(false);
          }}
        />
      ) : null}

      {editingRole ? (
        <RoleEditor
          membership={editingRole}
          displayName={users.find((u) => u.id === editingRole.userId)?.displayName ?? ''}
          onCancel={() => setEditingRole(null)}
          onSave={(patch, displayName) => {
            store.updateMembership(editingRole.userId, {
              ...patch,
              ...(displayName !== undefined ? { displayName } : {}),
            });
            setEditingRole(null);
          }}
          onRemove={
            !editingRole.hasAccount && isManager
              ? () => {
                  store.removePerson(editingRole.userId);
                  setEditingRole(null);
                }
              : undefined
          }
        />
      ) : null}

    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Expectations                                                        */
/* ------------------------------------------------------------------ */

function Expectations({ expectations }: { expectations: string }) {
  const { t } = usePreferences();
  if (!expectations.trim()) return null;

  return (
    <div className="mt-2.5">
      <div className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ter)]">
        {t.team.expectations}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-[15px] leading-snug text-[var(--sec)]">
        {expectations}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editors                                                             */
/* ------------------------------------------------------------------ */

function RoleEditor({
  membership,
  displayName,
  isNew = false,
  onCancel,
  onSave,
  onRemove,
}: {
  membership: Membership;
  displayName: string;
  isNew?: boolean;
  onCancel: () => void;
  /** `name` comes back only for somebody without an account; accounts own their name. */
  onSave: (patch: Partial<Membership>, name?: string) => void;
  onRemove?: () => void;
}) {
  const { t, locale } = usePreferences();
  const [draft, setDraft] = useState<Membership>(membership);
  const [name, setName] = useState(displayName);
  const [armed, arm, disarm] = useConfirm();
  const profile = !membership.hasAccount;

  const es = locale === 'es';
  const accessOptions: { value: AccessLevel; label: string }[] = es
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
      title={isNew ? t.team.newPerson : t.team.editRole}
      onCancel={onCancel}
      onSave={() =>
        onSave(
          {
            roleTitle: draft.roleTitle,
            roleDescription: draft.roleDescription,
            access: draft.access,
            expectations: draft.expectations.trim(),
          },
          profile ? name : undefined,
        )
      }
      canSave={draft.roleTitle.trim().length > 0 && (!profile || name.trim().length > 0)}
    >
      <FieldGroup footer={t.team.roleHint}>
        {profile ? (
          <TextField
            label={t.team.personName}
            value={name}
            onChange={setName}
            placeholder={es ? 'Marco Jiménez' : 'Marco Jiménez'}
          />
        ) : null}
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
            es
              ? 'Estabilidad de la plataforma, arquitectura, seguridad y fechas técnicas.'
              : 'Platform stability, architecture, security and technical dates.'
          }
          isLast
        />
      </FieldGroup>

      <FieldGroup header={t.team.expectations} footer={t.team.expectationsHint}>
        <TextAreaField
          label={t.team.expectations}
          value={draft.expectations}
          onChange={(expectations) => setDraft({ ...draft, expectations })}
          rows={5}
          placeholder={
            es
              ? 'Que el cierre financiero corra en menos de dos minutos, y que cada tarea suya en curso tenga un comentario al menos cada dos días.'
              : 'The financial close runs in under two minutes, and every task in flight gets a comment at least every two days.'
          }
          isLast
        />
      </FieldGroup>

      {profile ? null : (
        <FieldGroup>
          <SelectField
            label={es ? 'Permisos' : 'Access'}
            value={draft.access}
            options={accessOptions}
            onChange={(access) => setDraft({ ...draft, access })}
            isLast
          />
        </FieldGroup>
      )}

      {onRemove ? (
        <div className="mt-6">
          <div className="tn-card mx-4 overflow-hidden">
            <DestructiveRow
              label={armed ? t.team.removePersonConfirm : t.team.removePerson}
              onClick={() => {
                if (armed) {
                  disarm();
                  onRemove();
                } else {
                  arm();
                }
              }}
            />
          </div>
        </div>
      ) : null}
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

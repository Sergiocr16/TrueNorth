'use client';

import { useState } from 'react';
import type { AccessLevel, Membership, Role } from '@truenorth/core';
import { isOverdue, shareQuiet } from '@truenorth/core';
import { LargeTitle, Screen } from '../../components/shell';
import { Avatar, Banner, Card, SectionLabel, TextButton } from '../../components/ui';
import {
  AddRow,
  ChipSelectField,
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
import { makeRole, useRiskCount, useStore } from '../../lib/store';

/**
 * The team: the company's roles, and who holds which.
 *
 * A role is what decides scope — which Notion databases its holders see, and
 * so what the engine computes for them. People come after: who is on the
 * team, which roles they hold, what each answers for, and what is expected of
 * them. Nothing about how they are doing: that reading, the notes about what
 * is going on with somebody, and the messages to send all live on the
 * follow-up screen, which is the manager's, not the team's.
 */
export default function TeamPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [addingRole, setAddingRole] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Membership | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [inviting, setInviting] = useState(false);

  const { memberships, users, tasks, today, plan, roles, sources } = store;
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

      {/* Roles first: they are what a person's view is made of. */}
      <div className="mx-4 mt-3">
        <SectionLabel>{t.roles.title}</SectionLabel>
        <Card className="overflow-hidden">
          {roles.length === 0 ? (
            <p className="px-4 py-3.5 text-[15px] leading-snug text-[var(--ter)]">{t.roles.hint}</p>
          ) : (
            roles.map((role, index) => {
              const holders = memberships.filter((m) => m.roleIds.includes(role.id)).length;
              const named = role.sourceIds
                .map((id) => sources.find((s) => s.id === id)?.title)
                .filter(Boolean)
                .join(', ');
              const body = (
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-semibold text-[var(--ink)]">{role.name}</div>
                  <div className="text-[13px] leading-snug text-[var(--ter)]">
                    {t.roles.memberCount(holders)} · {named || t.roles.onlyApp}
                  </div>
                </div>
              );
              return isManager ? (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setEditingRole(role)}
                  className={`tn-press flex w-full items-center gap-3 px-4 py-3 text-left ${
                    index === roles.length - 1 ? '' : 'tn-hairline'
                  }`}
                >
                  {body}
                  <span className="text-[15px] font-semibold text-[var(--accent)]">{t.roles.edit}</span>
                </button>
              ) : (
                <div
                  key={role.id}
                  className={`flex items-center gap-3 px-4 py-3 ${index === roles.length - 1 ? '' : 'tn-hairline'}`}
                >
                  {body}
                </div>
              );
            })
          )}
          {isManager ? <AddRow label={t.roles.add} onClick={() => setAddingRole(true)} /> : null}
        </Card>
        {isManager ? (
          <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">{t.roles.hint}</p>
        ) : null}
      </div>

      <div className="mx-4 mt-4">
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
            const held = membership.roleIds
              .map((id) => roles.find((r) => r.id === id))
              .filter((r): r is Role => Boolean(r));

            return (
              <Card key={membership.userId} className="p-4">
                <div className="flex items-start gap-3.5">
                  <Avatar initials={user.initials} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-semibold text-[var(--ink)]">
                      {user.displayName}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {held.length === 0 ? (
                        <span className="text-[15px] text-[var(--sec)]">{t.roles.none}</span>
                      ) : (
                        held.map((role) => (
                          <span
                            key={role.id}
                            className="rounded-full px-2 py-0.5 text-[12px] font-semibold"
                            style={{
                              background:
                                role.id === membership.activeRoleId ? 'var(--accent-bg)' : 'var(--chip-bg)',
                              color: role.id === membership.activeRoleId ? 'var(--accent)' : 'var(--sec)',
                            }}
                            title={role.id === membership.activeRoleId ? t.roles.active : undefined}
                          >
                            {role.name}
                          </span>
                        ))
                      )}
                      {!membership.hasAccount ? (
                        <span className="rounded-full bg-[var(--chip-bg)] px-2 py-0.5 text-[12px] font-semibold text-[var(--ter)]">
                          {t.team.noAccount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {isManager || membership.userId === store.currentUser.id ? (
                    <TextButton onClick={() => setEditingPerson(membership)}>{t.team.editRole}</TextButton>
                  ) : null}
                </div>

                {membership.roleDescription ? (
                  <p className="mt-2.5 text-[15px] leading-snug text-[var(--sec)]">
                    <span className="font-semibold text-[var(--ink)]">{t.team.responsibility}: </span>
                    {membership.roleDescription}
                  </p>
                ) : null}

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

      {addingRole ? (
        <RoleSheet
          role={makeRole(store.company.id)}
          isNew
          onCancel={() => setAddingRole(false)}
          onSave={(role) => {
            store.upsertRole(role);
            setAddingRole(false);
          }}
        />
      ) : null}

      {editingRole ? (
        <RoleSheet
          role={editingRole}
          onCancel={() => setEditingRole(null)}
          onSave={(role) => {
            store.upsertRole(role);
            setEditingRole(null);
          }}
          onRemove={() => {
            store.deleteRole(editingRole.id);
            setEditingRole(null);
          }}
        />
      ) : null}

      {addingPerson ? (
        <PersonEditor
          membership={{
            userId: '',
            companyId: store.company.id,
            roleTitle: '',
            roleDescription: '',
            roleIds: roles[0] ? [roles[0].id] : [],
            activeRoleId: roles[0]?.id ?? null,
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
              roleIds: patch.roleIds ?? [],
              roleDescription: patch.roleDescription ?? '',
              expectations: patch.expectations ?? '',
            });
            setAddingPerson(false);
          }}
        />
      ) : null}

      {editingPerson ? (
        <PersonEditor
          membership={editingPerson}
          displayName={users.find((u) => u.id === editingPerson.userId)?.displayName ?? ''}
          onCancel={() => setEditingPerson(null)}
          onSave={(patch, displayName) => {
            store.updateMembership(editingPerson.userId, {
              ...patch,
              ...(displayName !== undefined ? { displayName } : {}),
            });
            setEditingPerson(null);
          }}
          onRemove={
            !editingPerson.hasAccount && isManager
              ? () => {
                  store.removePerson(editingPerson.userId);
                  setEditingPerson(null);
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
/* Role editor                                                         */
/* ------------------------------------------------------------------ */

function RoleSheet({
  role,
  isNew = false,
  onCancel,
  onSave,
  onRemove,
}: {
  role: Role;
  isNew?: boolean;
  onCancel: () => void;
  onSave: (role: Role) => void;
  onRemove?: () => void;
}) {
  const { t, locale } = usePreferences();
  const { sources } = useStore();
  const [draft, setDraft] = useState<Role>(role);
  const [armed, arm, disarm] = useConfirm();

  return (
    <EditSheet
      open
      title={isNew ? t.roles.newRole : role.name}
      onCancel={onCancel}
      onSave={() => onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim() })}
      canSave={draft.name.trim().length > 0}
    >
      <FieldGroup footer={t.roles.descriptionHint}>
        <TextField
          label={t.roles.name}
          value={draft.name}
          onChange={(name) => setDraft({ ...draft, name })}
          placeholder={locale === 'es' ? 'CTO, Ventas, Soporte…' : 'CTO, Sales, Support…'}
        />
        <TextAreaField
          label={t.roles.description}
          value={draft.description}
          onChange={(description) => setDraft({ ...draft, description })}
          rows={4}
          placeholder={
            locale === 'es'
              ? 'Estabilidad de la plataforma, arquitectura, seguridad y fechas técnicas.'
              : 'Platform stability, architecture, security and technical dates.'
          }
          isLast
        />
      </FieldGroup>

      <FieldGroup header={t.roles.sources} footer={t.roles.sourcesHint}>
        <ChipSelectField
          label={t.roles.sources}
          options={sources.map((s) => ({ value: s.id, label: s.title }))}
          selected={draft.sourceIds}
          onChange={(sourceIds) => setDraft({ ...draft, sourceIds })}
          emptyHint={sources.length === 0 ? t.roles.noSourcesYet : undefined}
          isLast
        />
      </FieldGroup>

      {onRemove ? (
        <div className="mt-6">
          <div className="tn-card mx-4 overflow-hidden">
            <DestructiveRow
              label={armed ? t.roles.removeConfirm : t.roles.remove}
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
          <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">{t.roles.removeHint}</p>
        </div>
      ) : null}
    </EditSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Person editor                                                       */
/* ------------------------------------------------------------------ */

function PersonEditor({
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
  const store = useStore();
  const [draft, setDraft] = useState<Membership>(membership);
  const [name, setName] = useState(displayName);
  const [armed, arm, disarm] = useConfirm();
  const profile = !membership.hasAccount;
  const isManager = store.currentMembership.access !== 'member';
  // A plain member editing themselves may only change their own line; the
  // rules say so, and the sheet offers no more than that.
  const self = !isManager && membership.userId === store.currentUser.id;

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
          self
            ? { roleDescription: draft.roleDescription }
            : {
                roleIds: draft.roleIds,
                roleDescription: draft.roleDescription,
                access: draft.access,
                expectations: draft.expectations.trim(),
              },
          profile ? name : undefined,
        )
      }
      canSave={(self || draft.roleIds.length > 0) && (!profile || name.trim().length > 0)}
    >
      <FieldGroup footer={t.team.roleHint}>
        {profile ? (
          <TextField
            label={t.team.personName}
            value={name}
            onChange={setName}
            placeholder="Marco Jiménez"
          />
        ) : null}
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

      {self ? null : (
        <FieldGroup header={t.team.personRoles} footer={t.team.personRolesHint}>
          <ChipSelectField
            label={t.team.personRoles}
            options={store.roles.map((r) => ({ value: r.id, label: r.name }))}
            selected={draft.roleIds}
            onChange={(roleIds) => setDraft({ ...draft, roleIds })}
            emptyHint={store.roles.length === 0 ? t.team.noRolesYet : t.team.pickAtLeastOne}
            isLast
          />
        </FieldGroup>
      )}

      {self ? null : (
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
      )}

      {profile || self ? null : (
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
  const [roleIds, setRoleIds] = useState<string[]>(store.roles[0] ? [store.roles[0].id] : []);
  const [access, setAccess] = useState<AccessLevel>('member');
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const es = locale === 'es';
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && roleIds.length > 0;
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
          .inviteMember(email, roleIds, access)
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
        <ChipSelectField
          label={t.team.personRoles}
          options={store.roles.map((r) => ({ value: r.id, label: r.name }))}
          selected={roleIds}
          onChange={setRoleIds}
          emptyHint={store.roles.length === 0 ? t.team.noRolesYet : t.team.pickAtLeastOne}
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

'use client';

import { useState } from 'react';
import type { AccessLevel, Membership, Role } from '@truenorth/core';
import { isOverdue, shareQuiet } from '@truenorth/core';
import { LargeTitle, Screen } from '../../components/shell';
import { Avatar, Banner, Card, PrimaryButton, SectionLabel, TextButton } from '../../components/ui';
import {
  AddRow,
  ChipSelectField,
  ToggleField,
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
import type { InviteResult } from '../../lib/store';
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
  const { t } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [addingRole, setAddingRole] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Membership | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [managing, setManaging] = useState<Membership | null>(null);

  const { memberships, users, tasks, today, plan, roles, sources } = store;
  const isManager = store.currentMembership.access !== 'member';
  const accounts = memberships.filter((m) => m.hasAccount);

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
              const assignedOnly = role.assignedOnlySourceIds ?? [];
              const named = role.sourceIds
                .map((id) => {
                  const title = sources.find((s) => s.id === id)?.title;
                  if (!title) return undefined;
                  return assignedOnly.includes(id) ? `${title} (${t.roles.assignedOnlyShort})` : title;
                })
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

      {/* Accounts are a different list from the team: who may open the app,
          as opposed to who does the work. Most of the team never signs in. */}
      {isManager ? (
        <div className="mx-4 mt-6">
          <SectionLabel>{t.team.accounts}</SectionLabel>
          <Card className="overflow-hidden">
            {accounts.length === 0 ? (
              <p className="px-4 py-3.5 text-[15px] leading-snug text-[var(--ter)]">{t.team.noAccounts}</p>
            ) : (
              accounts.map((membership, index) => {
                const user = users.find((u) => u.id === membership.userId);
                const held = membership.roleIds
                  .map((id) => roles.find((r) => r.id === id)?.name)
                  .filter(Boolean)
                  .join(' · ');
                const body = (
                  <>
                    <Avatar initials={user?.initials ?? '—'} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[17px] font-semibold text-[var(--ink)]">
                          {user?.displayName ?? membership.userId}
                        </span>
                        <span className="text-[13px] text-[var(--ter)]">{t.team.access[membership.access]}</span>
                        {membership.disabled ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[12px] font-semibold"
                            style={{ background: 'var(--red-bg)', color: 'var(--red)' }}
                          >
                            {t.team.accountDisabled}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 break-all text-[13px] text-[var(--ter)]">
                        {user?.email ?? ''}
                        {held ? ` · ${held}` : ''}
                      </div>
                    </div>
                  </>
                );
                const rowClass = `flex w-full items-center gap-3 px-4 py-3 text-left ${index === accounts.length - 1 ? '' : 'tn-hairline'}`;
                // The founder manages every account; everybody may open their own, to rename it.
                return store.canFound || membership.userId === store.currentUser.id ? (
                  <button
                    key={membership.userId}
                    type="button"
                    onClick={() => setManaging(membership)}
                    className={`tn-press ${rowClass}`}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={membership.userId} className={rowClass}>
                    {body}
                  </div>
                );
              })
            )}
            {store.canFound ? <AddRow label={t.team.shareAccess} onClick={() => setInviting(true)} /> : null}
          </Card>
          <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">
            {store.canFound ? t.team.accountsHint : t.team.accountsFounderOnly}
          </p>
        </div>
      ) : null}

      {inviting ? <InviteSheet onClose={() => setInviting(false)} /> : null}

      {managing ? <AccountSheet membership={managing} onClose={() => setManaging(null)} /> : null}

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
  const { sources, repos } = useStore();
  const [draft, setDraft] = useState<Role>(role);
  const [armed, arm, disarm] = useConfirm();
  // In the registered order, so the toggles line up with the chips above.
  // Repositories sit on the same list as Notion databases (ADR-010).
  const selectedSources = [
    ...sources.filter((s) => draft.sourceIds.includes(s.id)).map((s) => ({ id: s.id, title: s.title })),
    ...repos.filter((r) => draft.sourceIds.includes(r.id)).map((r) => ({ id: r.id, title: r.fullName })),
  ];
  const sourceOnly = (ids: string[]) => ids.filter((id) => !repos.some((r) => r.id === id));
  const repoOnly = (ids: string[]) => ids.filter((id) => repos.some((r) => r.id === id));

  return (
    <EditSheet
      open
      title={isNew ? t.roles.newRole : role.name}
      onCancel={onCancel}
      onSave={() =>
        onSave({
          ...draft,
          name: draft.name.trim(),
          description: draft.description.trim(),
          // Only sources the role reads can be read assigned-only.
          assignedOnlySourceIds: (draft.assignedOnlySourceIds ?? []).filter((id) =>
            draft.sourceIds.includes(id),
          ),
        })
      }
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
          selected={sourceOnly(draft.sourceIds)}
          onChange={(picked) => {
            const sourceIds = [...picked, ...repoOnly(draft.sourceIds)];
            setDraft({
              ...draft,
              sourceIds,
              assignedOnlySourceIds: (draft.assignedOnlySourceIds ?? []).filter((id) =>
                sourceIds.includes(id),
              ),
            });
          }}
          emptyHint={sources.length === 0 ? t.roles.noSourcesYet : undefined}
          isLast={repos.length === 0}
        />
        {repos.length > 0 ? (
          <ChipSelectField
            label={t.roles.repos}
            options={repos.map((r) => ({ value: r.id, label: r.fullName }))}
            selected={repoOnly(draft.sourceIds)}
            onChange={(picked) => {
              const sourceIds = [...sourceOnly(draft.sourceIds), ...picked];
              setDraft({
                ...draft,
                sourceIds,
                assignedOnlySourceIds: (draft.assignedOnlySourceIds ?? []).filter((id) =>
                  sourceIds.includes(id),
                ),
              });
            }}
            isLast
          />
        ) : null}
      </FieldGroup>

      {selectedSources.length > 0 ? (
        <FieldGroup header={t.roles.scope} footer={t.roles.scopeHint}>
          {selectedSources.map((source, index) => {
            const assignedOnly = (draft.assignedOnlySourceIds ?? []).includes(source.id);
            return (
              <ToggleField
                key={source.id}
                label={source.title}
                description={assignedOnly ? t.roles.assignedOnly : t.roles.everything}
                value={assignedOnly}
                onChange={(on) =>
                  setDraft({
                    ...draft,
                    assignedOnlySourceIds: on
                      ? [...(draft.assignedOnlySourceIds ?? []), source.id]
                      : (draft.assignedOnlySourceIds ?? []).filter((id) => id !== source.id),
                  })
                }
                isLast={index === selectedSources.length - 1}
              />
            );
          })}
        </FieldGroup>
      ) : null}

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
  // Same person as an account: the sync creates a member per Notion identity,
  // and one person can have two. The founder folds this one into the account.
  const [mergeInto, setMergeInto] = useState('');
  const [armedMerge, armMerge, disarmMerge] = useConfirm();
  const [merging, setMerging] = useState(false);
  const [mergeFailed, setMergeFailed] = useState<string | null>(null);
  const accounts = store.memberships.filter((m) => m.hasAccount);
  const accountOptions = [
    { value: '', label: t.team.mergeNone },
    ...accounts.map((m) => ({
      value: m.userId,
      label: store.users.find((u) => u.id === m.userId)?.displayName ?? m.userId,
    })),
  ];
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
                githubLogin: (draft.githubLogin ?? '').trim(),
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

      {self ? null : (
        <FieldGroup footer={t.team.githubLoginHint}>
          <TextField
            label={t.team.githubLogin}
            value={draft.githubLogin ?? ''}
            onChange={(githubLogin) => setDraft({ ...draft, githubLogin })}
            placeholder="jbelda"
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

      {profile && store.canFound && accounts.length > 0 ? (
        <FieldGroup header={t.team.mergeHeader} footer={t.team.mergeHint}>
          <SelectField
            label={t.team.mergeInto}
            value={mergeInto}
            options={accountOptions}
            onChange={(next) => {
              setMergeInto(next);
              disarmMerge();
            }}
          />
          <button
            type="button"
            disabled={!mergeInto || merging}
            onClick={() => {
              if (!mergeInto || merging) return;
              if (!armedMerge) {
                armMerge();
                return;
              }
              disarmMerge();
              setMerging(true);
              setMergeFailed(null);
              store
                .mergePerson(membership.userId, mergeInto)
                .then(() => onCancel())
                .catch((cause: unknown) =>
                  setMergeFailed(cause instanceof Error ? cause.message : String(cause)),
                )
                .finally(() => setMerging(false));
            }}
            className="tn-press flex min-h-[48px] w-full items-center px-4 text-[17px] font-semibold text-[var(--accent)] disabled:opacity-40"
          >
            {merging ? t.team.working : armedMerge ? t.team.mergeConfirm : t.team.merge}
          </button>
          {mergeFailed ? (
            <p className="px-4 pb-3 text-[13px] text-[var(--red)]">{mergeFailed}</p>
          ) : null}
        </FieldGroup>
      ) : null}

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

/**
 * Sharing the company with somebody, account and all. The server creates the
 * Firebase account when the address has none and hands back a one-time
 * password, which is shown here and nowhere else.
 */
/* ------------------------------------------------------------------ */
/* One account: switch it off, hand it a new key, or end it            */
/* ------------------------------------------------------------------ */

function AccountSheet({ membership, onClose }: { membership: Membership; onClose: () => void }) {
  const { t } = usePreferences();
  const store = useStore();
  const user = store.users.find((u) => u.id === membership.userId);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [armed, arm, disarm] = useConfirm();
  const [armedReset, armReset, disarmReset] = useConfirm();
  const [name, setName] = useState(user?.displayName ?? '');
  // One's own account can be renamed and nothing else; the founder does the rest to others.
  const self = membership.userId === store.currentUser.id;
  const canManage = store.canFound && !self;
  const nameChanged = name.trim().length >= 2 && name.trim() !== (user?.displayName ?? '');

  const run = (action: 'disable' | 'enable' | 'resetPassword' | 'delete') => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    store
      .manageAccount(membership.userId, action)
      .then((result) => {
        if (action === 'resetPassword') setPassword(result.password ?? null);
        else onClose();
      })
      .catch((cause: unknown) => setFailed(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  };

  if (password) {
    const credentials = `${user?.email ?? ''}\n${password}`.trim();
    return (
      <EditSheet open title={t.team.credentialsTitle} onCancel={onClose} cancelLabel={t.common.close}>
        <div className="px-4 py-6">
          <p className="text-[17px] leading-snug text-[var(--ink)]">{t.team.passwordReset}</p>
          <Card className="mt-4 overflow-hidden">
            <div className="tn-hairline px-4 py-3">
              <div className="text-[13px] font-semibold uppercase tracking-[0.6px] text-[var(--ter)]">
                {t.team.credentialsEmail}
              </div>
              <p className="mt-1 break-all text-[17px] text-[var(--ink)]">{user?.email ?? ''}</p>
            </div>
            <div className="px-4 py-3">
              <div className="text-[13px] font-semibold uppercase tracking-[0.6px] text-[var(--ter)]">
                {t.team.credentialsPassword}
              </div>
              <p className="tn-tabular mt-1 font-mono text-[22px] font-semibold tracking-[1px] text-[var(--ink)]">
                {password}
              </p>
            </div>
          </Card>
          <div className="mt-4">
            <PrimaryButton
              onClick={() => {
                void navigator.clipboard?.writeText(credentials).catch(() => undefined);
                setCopied(true);
              }}
            >
              {copied ? t.team.credentialsCopied : t.team.credentialsCopy}
            </PrimaryButton>
          </div>
          <div className="mt-4">
            <Banner tone="warning">{t.team.credentialsOnce}</Banner>
          </div>
        </div>
      </EditSheet>
    );
  }

  return (
    <EditSheet
      open
      title={user?.displayName ?? membership.userId}
      onCancel={onClose}
      cancelLabel={t.common.close}
      onSave={() => {
        if (!nameChanged || busy) return;
        setBusy(true);
        setFailed(null);
        store
          .manageAccount(membership.userId, 'rename', { displayName: name.trim() })
          .then(() => onClose())
          .catch((cause: unknown) => setFailed(cause instanceof Error ? cause.message : String(cause)))
          .finally(() => setBusy(false));
      }}
      canSave={nameChanged && !busy}
    >
      {failed ? (
        <div className="mx-4 mt-4">
          <Banner tone="error">{failed}</Banner>
        </div>
      ) : null}

      <FieldGroup footer={canManage ? t.team.accountHint : t.team.accountNameHint}>
        <TextField label={t.team.personName} value={name} onChange={setName} placeholder="Marco Jiménez" />
        <div className="tn-hairline px-4 py-3">
          <div className="text-[13px] font-semibold text-[var(--ter)]">{t.team.credentialsEmail}</div>
          <p className="mt-0.5 break-all text-[17px] text-[var(--ink)]">{user?.email ?? ''}</p>
        </div>
        <div className="px-4 py-3">
          <div className="text-[13px] font-semibold text-[var(--ter)]">{t.team.accountState}</div>
          <p className="mt-0.5 text-[17px] text-[var(--ink)]">
            {membership.disabled ? t.team.accountDisabled : t.team.accountEnabled}
          </p>
        </div>
      </FieldGroup>

      {canManage ? (
      <div className="mt-6">
        <div className="tn-card mx-4 overflow-hidden">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (armedReset) {
                disarmReset();
                run('resetPassword');
              } else {
                armReset();
              }
            }}
            className="tn-press tn-hairline flex min-h-[48px] w-full items-center px-4 text-[17px] font-semibold text-[var(--accent)]"
          >
            {armedReset ? t.team.resetPasswordConfirm : t.team.resetPassword}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(membership.disabled ? 'enable' : 'disable')}
            className="tn-press flex min-h-[48px] w-full items-center px-4 text-[17px] font-semibold text-[var(--accent)]"
          >
            {membership.disabled ? t.team.enableAccount : t.team.disableAccount}
          </button>
        </div>
        <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">{t.team.disableHint}</p>
      </div>
      ) : null}

      {canManage ? (
      <div className="mt-6">
        <div className="tn-card mx-4 overflow-hidden">
          <DestructiveRow
            label={busy ? t.team.working : armed ? t.team.deleteAccountConfirm : t.team.deleteAccount}
            onClick={() => {
              if (busy) return;
              if (armed) {
                disarm();
                run('delete');
              } else {
                arm();
              }
            }}
          />
        </div>
        <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">{t.team.deleteAccountHint}</p>
      </div>
      ) : null}
    </EditSheet>
  );
}

function InviteSheet({ onClose }: { onClose: () => void }) {
  const { t, locale } = usePreferences();
  const store = useStore();
  const [email, setEmail] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>(store.roles[0] ? [store.roles[0].id] : []);
  const [access, setAccess] = useState<AccessLevel>('member');
  // Who on the team this account is for. The sync creates people from Notion
  // under the address Notion has, which is rarely the one the account gets,
  // so the admin says it here and the person's tasks follow the account.
  const [personId, setPersonId] = useState('');
  const people = store.memberships.filter((m) => !m.hasAccount);
  const personOptions = [
    { value: '', label: t.team.newAccountPerson },
    ...people.map((m) => ({
      value: m.userId,
      label: store.users.find((u) => u.id === m.userId)?.displayName ?? m.userId,
    })),
  ];
  const [sent, setSent] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);
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
    const credentials = `${sent.email}\n${sent.password ?? ''}`.trim();
    return (
      <EditSheet
        open
        title={t.team.credentialsTitle}
        onCancel={onClose}
        cancelLabel={t.common.close}
      >
        <div className="px-4 py-6">
          <p className="text-[17px] leading-snug text-[var(--ink)]">
            {sent.password ? t.team.credentialsCreated : t.team.credentialsExisting(sent.email)}
          </p>

          {sent.password ? (
            <>
              <Card className="mt-4 overflow-hidden">
                <div className="tn-hairline px-4 py-3">
                  <div className="text-[13px] font-semibold uppercase tracking-[0.6px] text-[var(--ter)]">
                    {t.team.credentialsEmail}
                  </div>
                  <p className="mt-1 break-all text-[17px] text-[var(--ink)]">{sent.email}</p>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[13px] font-semibold uppercase tracking-[0.6px] text-[var(--ter)]">
                    {t.team.credentialsPassword}
                  </div>
                  <p className="tn-tabular mt-1 font-mono text-[22px] font-semibold tracking-[1px] text-[var(--ink)]">
                    {sent.password}
                  </p>
                </div>
              </Card>

              <div className="mt-4">
                <PrimaryButton
                  onClick={() => {
                    // A clipboard the browser refuses is not a failure worth a
                    // banner: the password is on screen to read out loud.
                    void navigator.clipboard?.writeText(credentials).catch(() => undefined);
                    setCopied(true);
                  }}
                >
                  {copied ? t.team.credentialsCopied : t.team.credentialsCopy}
                </PrimaryButton>
              </div>

              <div className="mt-4">
                <Banner tone="warning">{t.team.credentialsOnce}</Banner>
              </div>
            </>
          ) : null}
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
          .inviteMember(email, roleIds, access, personId || undefined)
          .then(setSent)
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

      <FieldGroup footer={t.team.linkPersonHint}>
        <SelectField
          label={t.team.linkPerson}
          value={personId}
          options={personOptions}
          onChange={(next) => {
            setPersonId(next);
            // The person's roles come along unless the form already chose some.
            const person = store.memberships.find((m) => m.userId === next);
            if (person && person.roleIds.length > 0) setRoleIds(person.roleIds);
          }}
        />
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

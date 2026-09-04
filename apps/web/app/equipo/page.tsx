'use client';

import { useState } from 'react';
import type { AccessLevel, Membership } from '@truenorth/core';
import { isOverdue } from '@truenorth/core';
import { LargeTitle, Screen } from '../../components/shell';
import { Avatar, Card, SectionLabel, TextButton } from '../../components/ui';
import { EditSheet, FieldGroup, SelectField, TextAreaField, TextField } from '../../components/form';
import { usePreferences } from '../../lib/preferences';
import { useRiskCount, useStore } from '../../lib/store';

export default function TeamPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [editing, setEditing] = useState<Membership | null>(null);

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

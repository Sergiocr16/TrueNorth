'use client';

import { useState } from 'react';
import type {
  AccessLevel,
  FollowUp,
  Membership,
  Situation,
  Standing,
  TeamReading,
} from '@truenorth/core';
import { isOverdue, notionUrl, todayIso } from '@truenorth/core';
import { LargeTitle, Screen } from '../../components/shell';
import { Avatar, Banner, Card, ChipButton, SectionLabel, TextButton } from '../../components/ui';
import {
  AddRow,
  DateField,
  DestructiveRow,
  EditSheet,
  FieldGroup,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
  useConfirm,
} from '../../components/form';
import { NotionMark } from '../../components/icons';
import { usePreferences } from '../../lib/preferences';
import { formatShortDate } from '../../lib/i18n/dictionary';
import { makeSituation, useRiskCount, useStore } from '../../lib/store';

/**
 * The team, and the follow-up that goes with it.
 *
 * Two audiences share this screen. Anybody may read who is on the team and what
 * each person answers for. Only owners and admins see the rest — the reading of
 * how somebody is doing, the private note about what is going on with them, and
 * the message the engine suggests sending today. That split is enforced in
 * firestore.rules; here it only decides what to draw, because a listener that is
 * refused simply comes back empty.
 */
export default function TeamPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [editingRole, setEditingRole] = useState<Membership | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [editingSituation, setEditingSituation] = useState<Situation | null>(null);
  const [inviting, setInviting] = useState(false);

  const { memberships, users, tasks, today, plan, followUp, situations } = store;
  const isManager = store.currentMembership.access !== 'member';
  const today0 = todayIso();

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle title={t.team.title} subtitle={store.company.name} />

      {isManager && !followUp ? (
        <div className="mx-4 mt-3">
          <Banner tone="info">{t.team.followUpNotYet}</Banner>
        </div>
      ) : null}

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

            const reading = followUp?.readings.find((r) => r.userId === user.id) ?? null;
            const messages = followUp?.messages.filter((m) => m.userId === user.id) ?? [];
            const situation =
              situations.find((s) => s.userId === user.id && (!s.endsAt || s.endsAt >= today0)) ??
              null;

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

                {isManager && reading ? <Reading reading={reading} /> : null}

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
                  {isManager && situation ? (
                    <button
                      type="button"
                      onClick={() => setEditingSituation(situation)}
                      className="tn-press rounded-full px-2.5 py-1 text-[13px] font-semibold"
                      style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}
                    >
                      {t.team.situationActive}
                      {situation.endsAt ? ` · ${formatShortDate(situation.endsAt, locale)}` : ''}
                    </button>
                  ) : null}
                </div>

                {isManager && !situation ? (
                  <div className="mt-2">
                    <TextButton
                      onClick={() =>
                        setEditingSituation(
                          makeSituation(store.company.id, user.id, store.currentUser.id),
                        )
                      }
                    >
                      {t.team.addSituation}
                    </TextButton>
                  </div>
                ) : null}

                {isManager && followUp ? (
                  messages.length > 0 ? (
                    messages.map((message) => (
                      <FollowUpBlock key={message.id} message={message} />
                    ))
                  ) : (
                    <p className="mt-3 border-t border-[var(--hair)] pt-2.5 text-[13px] leading-snug text-[var(--ter)]">
                      {t.team.followUpNone}
                    </p>
                  )
                ) : null}

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

      {editingSituation ? (
        <SituationEditor
          situation={editingSituation}
          onCancel={() => setEditingSituation(null)}
          onSave={(situation) => {
            store.upsertSituation(situation);
            setEditingSituation(null);
          }}
          onDelete={() => {
            store.deleteSituation(editingSituation.id);
            setEditingSituation(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* How somebody is doing                                               */
/* ------------------------------------------------------------------ */

const STANDING_STYLE: Record<Standing, { bg: string; fg: string }> = {
  adelantado: { bg: 'var(--green-bg)', fg: 'var(--green)' },
  en_curso: { bg: 'var(--chip-bg)', fg: 'var(--sec)' },
  atrasado: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
  trabado: { bg: 'var(--red-bg)', fg: 'var(--red)' },
};

function Reading({ reading }: { reading: TeamReading }) {
  const { t, locale } = usePreferences();
  const style = STANDING_STYLE[reading.standing];

  return (
    <div className="mt-3 border-t border-[var(--hair)] pt-3">
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-2.5 py-1 text-[13px] font-semibold"
          style={{ background: style.bg, color: style.fg }}
        >
          {t.team.standing[reading.standing]}
        </span>
        <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ter)]">
          {t.team.reading}
        </span>
      </div>

      <p className="mt-2 text-[15px] leading-snug text-[var(--ink)]">{reading.reading}</p>
      <p className="mt-2 text-[15px] leading-snug text-[var(--sec)]">
        <span className="font-semibold">{t.team.recommendation}: </span>
        {reading.recommendation}
      </p>

      {reading.signals.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {reading.signals.map((signal) => (
            <li key={signal.id} className="text-[13px] leading-snug text-[var(--faint)]">
              · {signal.summary[locale]}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The suggested message                                               */
/* ------------------------------------------------------------------ */

/**
 * Nothing leaves the app on its own: the text is copied, and the manager
 * decides where it goes. Editing before copying is not a nicety — what actually
 * gets sent is stored and fed back to tomorrow's run, so the engine learns the
 * register instead of repeating itself.
 */
function FollowUpBlock({ message }: { message: FollowUp }) {
  const { t, locale } = usePreferences();
  const store = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.message);
  const [failed, setFailed] = useState(false);

  const outcome = store.followUp?.outcome?.[message.id];
  // Narrowed into a const so the closure below keeps the discriminant.
  const target = message.target;
  const task =
    target.kind === 'comentario'
      ? store.tasks.find((candidate) => candidate.id === target.taskId)
      : undefined;
  const notion = notionUrl(task?.notionPageId);

  const copy = async () => {
    const text = editing ? draft : message.message;
    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
    } catch {
      // A browser that refuses the clipboard should not swallow the decision:
      // the message still counts as sent, and the text stays on screen to copy
      // by hand.
      setFailed(true);
    }
    store.markFollowUp(message.id, 'sent', text === message.message ? undefined : text);
    setEditing(false);
  };

  return (
    <div className="mt-3 border-t border-[var(--hair)] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ter)]">
          {t.team.followUp}
        </span>
        <span
          className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
          style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
        >
          {t.team.tone[message.tone]}
        </span>
        <span className="text-[13px] text-[var(--ter)]">
          {task ? t.team.followUpComment(task.code || task.title) : t.team.followUpDirect}
        </span>
        {notion ? (
          <a
            href={notion}
            target="_blank"
            rel="noreferrer"
            aria-label={t.task.openInNotion}
            title={t.task.openInNotion}
            className="tn-press inline-flex h-6 w-6 items-center justify-center"
          >
            <NotionMark size={15} />
          </a>
        ) : null}
      </div>

      {message.escalate ? (
        <div className="mt-2">
          <Banner tone="warning">{t.team.followUpEscalate}</Banner>
        </div>
      ) : null}

      {editing ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={6}
          className="mt-2 w-full rounded-xl border border-[var(--hair)] bg-[var(--chip-bg)] p-3 text-[15px] leading-snug text-[var(--ink)] outline-none"
        />
      ) : (
        <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[var(--chip-bg)] p-3 text-[15px] leading-snug text-[var(--ink)]">
          {message.message}
        </p>
      )}

      <p className="mt-2 text-[13px] leading-snug text-[var(--ter)]">
        <span className="font-semibold">{t.team.followUpWhy}: </span>
        {message.why}
      </p>

      {message.signals.length > 0 ? (
        <ul className="mt-1.5 flex flex-col gap-1">
          {message.signals.map((signal) => (
            <li key={signal.id} className="text-[13px] leading-snug text-[var(--faint)]">
              · {signal.summary[locale]}
            </li>
          ))}
        </ul>
      ) : null}

      {failed ? (
        <p className="mt-2 text-[13px] text-[var(--red)]">
          {locale === 'es'
            ? 'El navegador no dejó copiar. Seleccioná el texto de arriba.'
            : 'The browser refused to copy. Select the text above.'}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <ChipButton tone="positive" selected={outcome === 'sent'} onClick={() => void copy()}>
          {outcome === 'sent' ? t.team.followUpSent : t.team.followUpCopy}
        </ChipButton>
        <ChipButton selected={editing} onClick={() => setEditing((was) => !was)}>
          {t.team.followUpEdit}
        </ChipButton>
        <ChipButton
          selected={outcome === 'dismissed'}
          onClick={() => store.markFollowUp(message.id, 'dismissed')}
        >
          {t.team.followUpDismiss}
        </ChipButton>
      </div>
    </div>
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

function SituationEditor({
  situation,
  onCancel,
  onSave,
  onDelete,
}: {
  situation: Situation;
  onCancel: () => void;
  onSave: (situation: Situation) => void;
  onDelete: () => void;
}) {
  const { t, locale } = usePreferences();
  const [draft, setDraft] = useState(situation);
  const [armed, arm, disarm] = useConfirm();
  const es = locale === 'es';

  const kinds: { value: Situation['kind']; label: string }[] = [
    { value: 'personal', label: t.team.kind.personal },
    { value: 'carga', label: t.team.kind.carga },
    { value: 'desempeno', label: t.team.kind.desempeno },
    { value: 'salud', label: t.team.kind.salud },
    { value: 'motivacion', label: t.team.kind.motivacion },
    { value: 'otro', label: t.team.kind.otro },
  ];

  return (
    <EditSheet
      open
      title={t.team.editSituation}
      onCancel={onCancel}
      onSave={() => onSave(draft)}
      canSave={draft.note.trim().length > 0}
    >
      <FieldGroup footer={t.team.situationPrivate}>
        <TextAreaField
          label={t.team.situationNote}
          value={draft.note}
          onChange={(note) => setDraft({ ...draft, note })}
          rows={4}
          placeholder={
            es
              ? 'Anda con un tema familiar esta semana; bajarle la carga.'
              : 'Family matter this week; ease their load.'
          }
        />
        <SelectField
          label={t.team.situationKind}
          value={draft.kind}
          options={kinds}
          onChange={(kind) => setDraft({ ...draft, kind })}
        />
        <DateField
          label={t.team.situationUntil}
          value={draft.endsAt}
          onChange={(endsAt) => setDraft({ ...draft, endsAt })}
          isLast
        />
      </FieldGroup>

      <FieldGroup footer={t.team.situationDiscreetHint}>
        <ToggleField
          label={t.team.situationDiscreet}
          value={draft.discreet}
          onChange={(discreet) => setDraft({ ...draft, discreet })}
          isLast
        />
      </FieldGroup>

      <div className="mt-6">
        <div className="tn-card mx-4 overflow-hidden">
          <DestructiveRow
            label={
              armed
                ? es
                  ? 'Tocá otra vez para eliminar'
                  : 'Tap again to delete'
                : es
                  ? 'Eliminar situación'
                  : 'Delete situation'
            }
            onClick={() => {
              if (armed) {
                disarm();
                onDelete();
              } else {
                arm();
              }
            }}
          />
        </div>
      </div>
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

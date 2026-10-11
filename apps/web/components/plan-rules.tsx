'use client';

import { useState } from 'react';
import type { PlanRule, PlanRuleScope } from '@truenorth/core';
import { Card, ListRow, SectionLabel } from './ui';
import {
  DestructiveRow,
  EditSheet,
  FieldGroup,
  SelectField,
  TextAreaField,
  useConfirm,
} from './form';
import { usePreferences } from '../lib/preferences';
import { useStore } from '../lib/store';

/**
 * The rules a person has confirmed about how they work (ADR-014), on screen.
 *
 * Prose, like the role description — which is why the editor is one text area
 * and a scope, and nothing else. A rule changes how the plan is ordered and
 * worded; it never supplies a fact, so there is nothing here to validate
 * beyond "did they actually write something".
 */

/** One rule: the sentence, and where it applies. */
export function PlanRuleRow({
  rule,
  isLast,
  onOpen,
}: {
  rule: PlanRule;
  isLast?: boolean;
  onOpen: () => void;
}) {
  const { t } = usePreferences();
  const store = useStore();
  const scope =
    rule.scope === 'role'
      ? t.planRules.scopeRoleNamed(store.roles.find((r) => r.id === rule.roleId)?.name ?? '')
      : t.planRules.scopeGeneral;
  const origin = rule.source.kind === 'proposed' ? t.planRules.fromEngine : t.planRules.fromManual;

  return (
    <ListRow
      title={rule.text}
      subtitle={`${scope} · ${origin}`}
      isLast={isLast}
      chevron
      onClick={onOpen}
    />
  );
}

export function PlanRuleEditor({
  rule,
  isNew = false,
  onCancel,
  onSave,
  onDelete,
}: {
  rule: PlanRule;
  isNew?: boolean;
  onCancel: () => void;
  onSave: (rule: PlanRule) => void;
  onDelete?: () => void;
}) {
  const { t } = usePreferences();
  const store = useStore();
  const [draft, setDraft] = useState<PlanRule>(rule);
  const [confirming, arm, disarm] = useConfirm();

  return (
    <EditSheet
      open
      title={isNew ? t.planRules.new : t.planRules.edit}
      onCancel={onCancel}
      onSave={() => onSave({ ...draft, text: draft.text.trim() })}
      canSave={draft.text.trim().length > 0}
    >
      <FieldGroup footer={t.planRules.intro}>
        <TextAreaField
          label={t.planRules.textField}
          value={draft.text}
          onChange={(text) => setDraft({ ...draft, text })}
          placeholder={t.planRules.textPlaceholder}
          rows={3}
          isLast
        />
      </FieldGroup>

      <FieldGroup>
        <SelectField
          label={t.planRules.scopeField}
          value={draft.scope}
          options={[
            { value: 'general' as PlanRuleScope, label: t.planRules.scopeGeneral },
            { value: 'role' as PlanRuleScope, label: t.planRules.scopeRole },
          ]}
          // A rule narrowed to a role belongs to the role the person has on;
          // widened again, it belongs to none.
          onChange={(scope) =>
            setDraft({
              ...draft,
              scope,
              roleId: scope === 'role' ? store.activeRole?.id ?? null : null,
            })
          }
          isLast
        />
      </FieldGroup>

      {onDelete ? (
        <div className="mt-6">
          <div className="tn-card mx-4 overflow-hidden">
            <DestructiveRow
              label={confirming ? t.planRules.deleteConfirm : t.planRules.delete}
              onClick={() => {
                if (confirming) {
                  disarm();
                  onDelete();
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

/** The list, used by the screen. Returns null when there is nothing in it. */
export function PlanRuleSection({
  title,
  footer,
  rules,
  onOpen,
}: {
  title: string;
  footer?: string;
  rules: PlanRule[];
  onOpen: (rule: PlanRule) => void;
}) {
  if (rules.length === 0) return null;
  return (
    <div className="mt-5">
      <SectionLabel>{title}</SectionLabel>
      <Card className="overflow-hidden">
        {rules.map((rule, index) => (
          <PlanRuleRow
            key={rule.id}
            rule={rule}
            isLast={index === rules.length - 1}
            onOpen={() => onOpen(rule)}
          />
        ))}
      </Card>
      {footer ? <p className="mt-1.5 px-1 text-[13px] leading-snug text-[var(--ter)]">{footer}</p> : null}
    </div>
  );
}

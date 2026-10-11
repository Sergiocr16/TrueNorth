'use client';

import { useState } from 'react';
import type { PlanRule } from '@truenorth/core';
import { MAX_PLAN_RULES, activeRules } from '@truenorth/core';
import { LargeTitle, Screen } from '../../components/shell';
import { Card, EmptyState } from '../../components/ui';
import { AddRow } from '../../components/form';
import { CompassGlyph } from '../../components/icons';
import { PlanRuleEditor, PlanRuleSection } from '../../components/plan-rules';
import { usePreferences } from '../../lib/preferences';
import { makePlanRule, useRiskCount, useStore } from '../../lib/store';

/**
 * My rules (ADR-014): how I work, in my own words, which the plan prompt
 * reads every morning.
 *
 * Two lists. The active ones are what reaches the prompt — scoped to the role
 * I have on, so the screen shows what the engine will actually read today.
 * The dismissed ones are kept, and said to be kept, so it is obvious why the
 * engine stopped proposing something.
 */
export default function PlanRulesPage() {
  const { t } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [editing, setEditing] = useState<{ rule: PlanRule; isNew: boolean } | null>(null);

  const active = activeRules(store.planRules, store.activeRole?.id ?? null);
  // In scope for another role: real, mine, and not read today.
  const otherRoles = store.planRules.filter(
    (rule) => rule.status === 'confirmed' && !active.some((r) => r.id === rule.id),
  );
  const dismissed = store.planRules.filter((rule) => rule.status === 'rejected');

  const open = (rule: PlanRule) => setEditing({ rule, isNew: false });

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle title={t.planRules.title} subtitle={t.planRules.subtitle} />

      {store.planRules.length === 0 ? (
        <Card className="mx-4 mt-4">
          <EmptyState
            icon={<CompassGlyph size={34} />}
            title={t.planRules.emptyTitle}
            body={t.planRules.emptyBody}
          />
        </Card>
      ) : (
        <p className="mx-4 mt-4 px-1 text-[13px] leading-snug text-[var(--ter)]">{t.planRules.intro}</p>
      )}

      <div className="mx-4">
        <PlanRuleSection
          title={t.planRules.sectionConfirmed}
          footer={active.length >= MAX_PLAN_RULES ? t.planRules.cap(MAX_PLAN_RULES) : undefined}
          rules={active}
          onOpen={open}
        />
        <PlanRuleSection title={t.planRules.scopeRole} rules={otherRoles} onOpen={open} />
        <PlanRuleSection
          title={t.planRules.sectionRejected}
          footer={t.planRules.rejectedHint}
          rules={dismissed}
          onOpen={open}
        />
      </div>

      <div className="mx-4 mt-3">
        <Card className="overflow-hidden">
          <AddRow
            label={t.planRules.add}
            onClick={() => setEditing({ rule: makePlanRule(), isNew: true })}
          />
        </Card>
      </div>

      {editing ? (
        <PlanRuleEditor
          rule={editing.rule}
          isNew={editing.isNew}
          onCancel={() => setEditing(null)}
          onSave={(next) => {
            store.upsertPlanRule(next);
            setEditing(null);
          }}
          onDelete={
            editing.isNew
              ? undefined
              : () => {
                  store.deletePlanRule(editing.rule.id);
                  setEditing(null);
                }
          }
        />
      ) : null}
    </Screen>
  );
}

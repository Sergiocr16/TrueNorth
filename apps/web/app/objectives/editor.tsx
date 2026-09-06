'use client';

import { useState } from 'react';
import type { Indicator, Objective, Priority } from '@truenorth/core';
import { indicatorProgressPct, objectiveProgressPct } from '@truenorth/core';
import {
  AddRow,
  DateField,
  DestructiveRow,
  EditSheet,
  FieldGroup,
  NumberField,
  PercentField,
  SelectField,
  StaticField,
  TextAreaField,
  TextField,
  useConfirm,
} from '../../components/form';
import { usePreferences } from '../../lib/preferences';
import { makeIndicator, useStore } from '../../lib/store';

/**
 * Create or edit an objective, including its indicators. Health is derived
 * from the dates and the progress, so it is never edited by hand — and with
 * indicators, neither is the progress.
 */
export function ObjectiveEditor({
  objective,
  isNew = false,
  onCancel,
  onSave,
  onDelete,
}: {
  objective: Objective;
  isNew?: boolean;
  onCancel: () => void;
  onSave: (objective: Objective) => void;
  onDelete?: () => void;
}) {
  const { t, locale } = usePreferences();
  const { users } = useStore();
  const [draft, setDraft] = useState<Objective>(objective);
  const [confirming, arm, disarm] = useConfirm();

  const priorityOptions: { value: Priority; label: string }[] =
    locale === 'es'
      ? [
          { value: 'low', label: 'Baja' },
          { value: 'medium', label: 'Media' },
          { value: 'high', label: 'Alta' },
          { value: 'max', label: 'Máxima' },
        ]
      : [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'max', label: 'Max' },
        ];

  const patchIndicator = (index: number, patch: Partial<Indicator>) =>
    setDraft({
      ...draft,
      indicators: draft.indicators.map((indicator, i) =>
        i === index ? { ...indicator, ...patch } : indicator,
      ),
    });

  return (
    <EditSheet
      open
      title={
        isNew
          ? locale === 'es'
            ? 'Nuevo objetivo'
            : 'New objective'
          : locale === 'es'
            ? 'Editar objetivo'
            : 'Edit objective'
      }
      onCancel={onCancel}
      onSave={() => onSave(draft)}
      canSave={draft.title.trim().length > 0}
    >
      <FieldGroup>
        <TextAreaField
          label={locale === 'es' ? 'Título' : 'Title'}
          value={draft.title}
          onChange={(title) => setDraft({ ...draft, title })}
          placeholder={locale === 'es' ? 'Reducir 30 % los tickets' : 'Cut support tickets by 30 %'}
          rows={2}
        />
        <TextAreaField
          label={t.objectives.expectedResult}
          value={draft.expectedResult}
          onChange={(expectedResult) => setDraft({ ...draft, expectedResult })}
          rows={2}
          isLast
        />
      </FieldGroup>

      <FieldGroup>
        <SelectField
          label={t.objectives.owner}
          value={draft.ownerUserId}
          options={users.map((user) => ({ value: user.id, label: user.displayName }))}
          onChange={(ownerUserId) => setDraft({ ...draft, ownerUserId })}
        />
        <SelectField
          label={locale === 'es' ? 'Prioridad' : 'Priority'}
          value={draft.priority}
          options={priorityOptions}
          onChange={(priority) => setDraft({ ...draft, priority })}
        />
        <DateField
          label={locale === 'es' ? 'Inicio' : 'Start'}
          value={draft.startDate}
          onChange={(value) => setDraft({ ...draft, startDate: value ?? draft.startDate })}
        />
        <DateField
          label={t.company.deadline}
          value={draft.targetDate}
          onChange={(value) => setDraft({ ...draft, targetDate: value ?? draft.targetDate })}
        />
        {draft.indicators.length > 0 ? (
          <StaticField
            label={t.objectives.actual}
            value={`${objectiveProgressPct(draft)} %`}
            hint={t.objectives.derivedFromIndicators}
            isLast
          />
        ) : (
          <PercentField
            label={t.objectives.actual}
            value={draft.progressPct}
            onChange={(progressPct) => setDraft({ ...draft, progressPct })}
            isLast
          />
        )}
      </FieldGroup>

      <FieldGroup header={t.objectives.indicators} footer={t.objectives.indicatorsHint}>
        {draft.indicators.map((indicator, index) => (
          <div key={indicator.id} className="tn-hairline px-4 py-3">
            <div className="flex items-center gap-2">
              <input
                value={indicator.name}
                onChange={(event) => patchIndicator(index, { name: event.target.value })}
                placeholder={locale === 'es' ? 'Nombre del indicador' : 'Indicator name'}
                aria-label={locale === 'es' ? 'Nombre del indicador' : 'Indicator name'}
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[17px] font-semibold text-[var(--ink)] outline-none placeholder:font-normal placeholder:text-[var(--ter)]"
              />
              <input
                value={indicator.unit}
                onChange={(event) => patchIndicator(index, { unit: event.target.value })}
                placeholder={locale === 'es' ? 'unidad' : 'unit'}
                aria-label={locale === 'es' ? 'Unidad' : 'Unit'}
                className="w-20 bg-transparent py-1.5 text-right text-[15px] text-[var(--sec)] outline-none"
              />
              <span className="tn-tabular shrink-0 text-[13px] text-[var(--ter)]">
                {indicatorProgressPct(indicator)} %
              </span>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    indicators: draft.indicators.filter((_, i) => i !== index),
                  })
                }
                aria-label={locale === 'es' ? 'Eliminar indicador' : 'Remove indicator'}
                className="tn-press h-9 w-9 shrink-0 rounded-full text-[var(--red)]"
              >
                &times;
              </button>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(
                [
                  ['baseline', t.objectives.baseline],
                  ['current', t.objectives.current],
                  ['target', t.objectives.target],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-0.5">
                  <span className="text-[12px] text-[var(--ter)]">{label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={indicator[key]}
                    onChange={(event) => patchIndicator(index, { [key]: Number(event.target.value) })}
                    className="tn-tabular rounded-lg bg-[var(--chip-bg)] px-2 py-1.5 text-[15px] text-[var(--ink)] outline-none"
                  />
                </label>
              ))}
            </div>
            <div className="mt-2">
              <DateField
                label={t.objectives.indicatorDue}
                value={indicator.targetDate ?? null}
                onChange={(targetDate) => patchIndicator(index, { targetDate })}
              />
              <SelectField
                label={locale === 'es' ? 'Dirección' : 'Direction'}
                value={indicator.direction}
                options={[
                  { value: 'up', label: locale === 'es' ? 'Subir' : 'Up' },
                  { value: 'down', label: locale === 'es' ? 'Bajar' : 'Down' },
                ]}
                onChange={(direction) => patchIndicator(index, { direction })}
                isLast
              />
            </div>
          </div>
        ))}
        <AddRow
          label={locale === 'es' ? 'Agregar indicador' : 'Add indicator'}
          onClick={() => setDraft({ ...draft, indicators: [...draft.indicators, makeIndicator()] })}
        />
      </FieldGroup>

      {onDelete ? (
        <div className="mt-6">
          <div className="tn-card mx-4 overflow-hidden">
            <DestructiveRow
              label={
                confirming
                  ? locale === 'es'
                    ? 'Tocá otra vez para eliminar'
                    : 'Tap again to delete'
                  : locale === 'es'
                    ? 'Eliminar objetivo'
                    : 'Delete objective'
              }
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
          <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">
            {locale === 'es'
              ? 'Los proyectos que lo servían quedan sin objetivo y aparecerán en Riesgos.'
              : 'Projects that served it become orphans and will show up in Risks.'}
          </p>
        </div>
      ) : null}
    </EditSheet>
  );
}

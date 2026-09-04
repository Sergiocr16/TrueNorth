'use client';

import { useState } from 'react';
import { Sheet } from './ui';
import { CheckIcon, ChevronDown } from './icons';
import { usePreferences } from '../lib/preferences';
import { useStore } from '../lib/store';

/**
 * The role a person has on, and the way to change it.
 *
 * A pill with the active role's name; tapping it lists the person's roles.
 * Choosing one writes `activeRoleId`, and everything follows: the listeners
 * re-subscribe to that role's sources, and Today, Briefing and Follow-up show
 * that role's documents. Hidden for people with a single role — there is
 * nothing to switch to — and for people with none, who get told elsewhere.
 */
export function RoleSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = usePreferences();
  const store = useStore();
  const [open, setOpen] = useState(false);

  const mine = store.roles.filter((r) => store.currentMembership.roleIds.includes(r.id));
  if (mine.length < 2) return null;
  const active = store.activeRole;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.roles.switch}
        title={t.roles.switch}
        className={`tn-press inline-flex h-11 max-w-[160px] items-center gap-1.5 rounded-full border border-[var(--hair)] bg-[var(--surface)] ${
          compact ? 'px-3' : 'px-3.5'
        } text-[15px] font-semibold text-[var(--accent)]`}
      >
        <span className="min-w-0 truncate">{active?.name ?? t.roles.none}</span>
        <span className="shrink-0 text-[var(--ter)]">
          <ChevronDown />
        </span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} labelledBy="role-switcher">
        <h2 id="role-switcher" className="mt-3 self-start text-[22px] font-bold text-[var(--ink)]">
          {t.roles.switch}
        </h2>
        <p className="mt-1 self-start text-[15px] leading-snug text-[var(--sec)]">
          {t.roles.switchHint}
        </p>
        <div className="tn-card mt-4 w-full overflow-hidden">
          {mine.map((role, index) => {
            const isOn = role.id === active?.id;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => {
                  store.setActiveRole(role.id);
                  setOpen(false);
                }}
                aria-pressed={isOn}
                className={`tn-press flex w-full items-center gap-3 px-4 py-3 text-left ${
                  index === mine.length - 1 ? '' : 'tn-hairline'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold text-[var(--ink)]">{role.name}</span>
                  {role.description ? (
                    <span className="block text-[13px] leading-snug text-[var(--ter)] line-clamp-2">
                      {role.description}
                    </span>
                  ) : null}
                </span>
                {isOn ? (
                  <span className="shrink-0 text-[var(--accent)]">
                    <CheckIcon size={16} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

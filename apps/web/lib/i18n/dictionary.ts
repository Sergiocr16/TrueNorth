import type { Locale } from '@truenorth/core';

/**
 * Every user-facing string lives here. Spanish is the default and is written
 * first, because it runs 20-30 % longer than English and is what sets the
 * layout. Nothing user-facing may be hardcoded in a component.
 */
export const dictionary = {
  es: {
    appName: 'TrueNorth',
    promise: 'Tu plan de hoy, con el porqué de cada cosa.',

    nav: {
      today: 'Hoy',
      briefing: 'Briefing',
      briefingLong: 'Briefing ejecutivo',
      company: 'Empresa',
      objectives: 'Objetivos',
      projects: 'Proyectos',
      team: 'Equipo',
      risks: 'Riesgos',
      reports: 'Reportes',
      integrations: 'Integraciones',
      settings: 'Ajustes',
      more: 'Más',
    },

    auth: {
      google: 'Continuar con Google',
      emailLink: 'Enviar enlace por correo',
      chooseCompany: 'Elegir empresa',
      chooseCompanySub: 'Tus empresas y tu rol en cada una.',
      role: 'Rol',
      inviteHint:
        '¿Trabajas con otra empresa? Pide a un administrador que te invite. Podrás cambiar de empresa desde la barra de navegación.',
    },

    today: {
      priority: 'Tu prioridad de hoy',
      why: 'Por qué',
      planCount: (n: number) => `Tu plan · ${n} ${n === 1 ? 'elemento' : 'elementos'}`,
      recalculate: 'Recalcular mi plan',
      recalculating: 'Recalculando tu plan…',
      recalculatingHint: 'Estoy revisando lo que cambió desde ayer. Toma unos segundos.',
      ifNotToday: 'Si no se hace hoy,',
      signal: 'señal',
      minutes: 'min',
      done: 'Hecho',
      skipped: 'Omitido',
      irrelevant: 'No aplica',
      dictate: 'Dictar actualización',
      emptyTitle: 'Todavía no hay plan',
      emptyBody:
        'Cargá la meta de la empresa y al menos un objetivo con proyectos. El motor corre cada mañana a las 5:00.',
      emptyAction: 'Configurar la empresa',
      offline: 'Sin conexión: mostrando el plan de hoy guardado',
    },

    voice: {
      recording: 'Grabando…',
      prompt: 'Cuéntame qué avanzaste y qué cambió. Yo lo interpreto.',
      cancel: 'Cancelar',
      stop: 'Detener',
      processing: 'Interpretando lo que dijiste…',
      processingHint: 'Transcribo y busco a qué tareas se refiere.',
      understood: 'Esto es lo que entendí',
      reviewHint: 'Revisa y confirma antes de aplicar en Notion.',
      transcript: 'Transcripción',
      edit: 'Corregir',
      discard: 'Descartar',
      discarded: 'Descartado',
      confirmAll: 'Confirmar todo',
      applied: 'Aplicado en Notion',
      appliedHint: 'Los cambios ya están en las páginas de Notion.',
      conflict: 'Conflicto: la página cambió en Notion',
      conflictHint: 'Alguien editó esta página después de la última sincronización.',
      viewInNotion: 'Ver en Notion',
      fields: {
        status: 'Estado',
        dueDate: 'Fecha límite',
        note: 'Nota',
        assignee: 'Responsable',
      },
      noDate: 'sin fecha',
    },

    status: {
      on_track: 'En curso',
      at_risk: 'En riesgo',
      late: 'Atrasado',
      done: 'Completado',
    },

    taskStatus: {
      todo: 'Por hacer',
      in_progress: 'En curso',
      blocked: 'Bloqueada',
      done: 'Terminada',
    },

    company: {
      northStar: 'Meta global',
      deadline: 'Fecha objetivo',
      daysLeft: (n: number) => `${n} días`,
      plans: 'Planes',
      plan3: 'A 3 meses',
      plan6: 'A 6 meses',
      plan12: 'A 12 meses',
      overall: 'Estado general',
    },

    objectives: {
      title: 'Objetivos',
      expectedResult: 'Resultado esperado',
      indicators: 'Indicadores',
      baseline: 'Base',
      current: 'Actual',
      target: 'Meta',
      linkedProjects: 'Proyectos que lo sirven',
      expected: 'Avance esperado',
      actual: 'Avance real',
      gap: (n: number) => `${n} pts de brecha`,
      owner: 'Responsable',
    },

    projects: {
      title: 'Proyectos',
      orphanWarning: 'Proyecto sin objetivo',
      orphanBody: 'Consume trabajo pero no contribuye a ninguna meta.',
      servesObjectives: 'Objetivos que sirve',
      tasks: 'Tareas',
      dependencies: 'Dependencias',
      blockedBy: 'Bloqueada por',
      source: 'Origen',
      noDue: 'Sin fecha',
      unassigned: 'Sin responsable',
    },

    team: {
      title: 'Equipo',
      responsibility: 'Responsabilidad',
      editRole: 'Editar rol',
      roleTitle: 'Rol',
      roleDescription: 'Descripción de la responsabilidad',
      roleHint:
        'Esto es lo que el agente usa para adaptar las recomendaciones. Sé concreto sobre lo que esta persona responde.',
      openTasks: 'abiertas',
      overdueTasks: 'vencidas',
      todaysFocus: 'Su foco de hoy',
      save: 'Guardar',
      cancel: 'Cancelar',
    },

    risks: {
      title: 'Riesgos',
      overdue: 'Tareas vencidas',
      blocked: 'Tareas bloqueadas',
      orphans: 'Proyectos sin objetivo',
      emptyObjectives: 'Objetivos sin trabajo activo',
      decisions: 'Decisiones pendientes',
      none: 'Nada pendiente en esta sección.',
    },

    integrations: {
      title: 'Integraciones',
      notion: 'Notion',
      connected: 'Conectado',
      workspace: 'Espacio de trabajo',
      sources: 'Fuentes autorizadas',
      lastSync: 'Última sincronización',
      syncNow: 'Sincronizar ahora',
      mapping: 'Mapeo de propiedades',
      mappingHint:
        'Indicá qué propiedad de Notion corresponde a cada campo. Sin mapeo, la base se lee como documentación.',
      fieldStatus: 'Estado',
      fieldAssignee: 'Responsable',
      fieldDueDate: 'Fecha límite',
      fieldProject: 'Proyecto',
      statusMapping: 'Equivalencia de estados',
      statusMappingHint:
        'Los quince estados de Notion se agrupan en cuatro estados internos.',
    },

    settings: {
      title: 'Ajustes',
      language: 'Idioma',
      spanish: 'Español',
      english: 'English',
      deliveryTime: 'Hora de entrega del plan',
      notifications: 'Notificaciones',
      pushEnabled: 'Aviso diario',
      theme: 'Tema',
      themeSystem: 'Sistema',
      themeLight: 'Claro',
      themeDark: 'Oscuro',
      reduceTransparency: 'Reducir transparencia',
      reduceTransparencyHint: 'Reemplaza el vidrio por superficies sólidas.',
      signOut: 'Cerrar sesión',
      account: 'Cuenta',
    },

    briefing: {
      title: 'Briefing ejecutivo',
      generatedAt: (time: string) => `generado hoy ${time}`,
      topRisks: 'Riesgos principales',
      decisions: 'Decisiones pendientes',
      perspectives: 'Perspectivas',
    },

    perspectives: {
      ceo: 'CEO',
      coo: 'COO',
      cto: 'CTO',
      cfo: 'CFO',
      pm: 'PM',
    },

    common: {
      back: 'Atrás',
      close: 'Cerrar',
      seeAll: 'Ver todo',
      today: 'Hoy',
      source: 'Origen',
      notion: 'Notion',
      app: 'TrueNorth',
    },
  },

  en: {
    appName: 'TrueNorth',
    promise: "Today's plan, with the reason behind each item.",

    nav: {
      today: 'Today',
      briefing: 'Briefing',
      briefingLong: 'Executive briefing',
      company: 'Company',
      objectives: 'Objectives',
      projects: 'Projects',
      team: 'Team',
      risks: 'Risks',
      reports: 'Reports',
      integrations: 'Integrations',
      settings: 'Settings',
      more: 'More',
    },

    auth: {
      google: 'Continue with Google',
      emailLink: 'Email me a sign-in link',
      chooseCompany: 'Choose company',
      chooseCompanySub: 'Your companies and your role in each.',
      role: 'Role',
      inviteHint:
        'Work with another company? Ask an admin to invite you. You can switch companies from the navigation bar.',
    },

    today: {
      priority: 'Your priority today',
      why: 'Why',
      planCount: (n: number) => `Your plan · ${n} ${n === 1 ? 'item' : 'items'}`,
      recalculate: 'Recalculate my plan',
      recalculating: 'Recalculating your plan…',
      recalculatingHint: "I'm checking what changed since yesterday. This takes a few seconds.",
      ifNotToday: "If this doesn't happen today,",
      signal: 'signal',
      minutes: 'min',
      done: 'Done',
      skipped: 'Skipped',
      irrelevant: 'Not applicable',
      dictate: 'Dictate an update',
      emptyTitle: 'No plan yet',
      emptyBody:
        'Add the company goal and at least one objective with projects. The engine runs every morning at 5:00.',
      emptyAction: 'Set up the company',
      offline: "Offline: showing today's saved plan",
    },

    voice: {
      recording: 'Recording…',
      prompt: "Tell me what moved and what changed. I'll interpret it.",
      cancel: 'Cancel',
      stop: 'Stop',
      processing: 'Interpreting what you said…',
      processingHint: 'Transcribing and matching it to tasks.',
      understood: "Here's what I understood",
      reviewHint: 'Review and confirm before applying to Notion.',
      transcript: 'Transcript',
      edit: 'Edit',
      discard: 'Discard',
      discarded: 'Discarded',
      confirmAll: 'Confirm all',
      applied: 'Applied in Notion',
      appliedHint: 'The changes are on the Notion pages now.',
      conflict: 'Conflict: the page changed in Notion',
      conflictHint: 'Someone edited this page after the last sync.',
      viewInNotion: 'View in Notion',
      fields: {
        status: 'Status',
        dueDate: 'Due date',
        note: 'Note',
        assignee: 'Owner',
      },
      noDate: 'no date',
    },

    status: {
      on_track: 'On track',
      at_risk: 'At risk',
      late: 'Late',
      done: 'Done',
    },

    taskStatus: {
      todo: 'To do',
      in_progress: 'In progress',
      blocked: 'Blocked',
      done: 'Done',
    },

    company: {
      northStar: 'North star',
      deadline: 'Target date',
      daysLeft: (n: number) => `${n} days`,
      plans: 'Plans',
      plan3: '3 months',
      plan6: '6 months',
      plan12: '12 months',
      overall: 'Overall status',
    },

    objectives: {
      title: 'Objectives',
      expectedResult: 'Expected result',
      indicators: 'Indicators',
      baseline: 'Baseline',
      current: 'Current',
      target: 'Target',
      linkedProjects: 'Projects serving it',
      expected: 'Expected progress',
      actual: 'Actual progress',
      gap: (n: number) => `${n} pts behind`,
      owner: 'Owner',
    },

    projects: {
      title: 'Projects',
      orphanWarning: 'Project without an objective',
      orphanBody: 'It consumes work but contributes to no goal.',
      servesObjectives: 'Objectives it serves',
      tasks: 'Tasks',
      dependencies: 'Dependencies',
      blockedBy: 'Blocked by',
      source: 'Source',
      noDue: 'No date',
      unassigned: 'No owner',
    },

    team: {
      title: 'Team',
      responsibility: 'Responsibility',
      editRole: 'Edit role',
      roleTitle: 'Role',
      roleDescription: 'Responsibility description',
      roleHint:
        'This is what the agent uses to tailor recommendations. Be concrete about what this person answers for.',
      openTasks: 'open',
      overdueTasks: 'overdue',
      todaysFocus: "Their focus today",
      save: 'Save',
      cancel: 'Cancel',
    },

    risks: {
      title: 'Risks',
      overdue: 'Overdue tasks',
      blocked: 'Blocked tasks',
      orphans: 'Projects without an objective',
      emptyObjectives: 'Objectives with no active work',
      decisions: 'Pending decisions',
      none: 'Nothing pending in this section.',
    },

    integrations: {
      title: 'Integrations',
      notion: 'Notion',
      connected: 'Connected',
      workspace: 'Workspace',
      sources: 'Authorised sources',
      lastSync: 'Last sync',
      syncNow: 'Sync now',
      mapping: 'Property mapping',
      mappingHint:
        'Tell us which Notion property maps to each field. Without a mapping, the database is read as documentation.',
      fieldStatus: 'Status',
      fieldAssignee: 'Owner',
      fieldDueDate: 'Due date',
      fieldProject: 'Project',
      statusMapping: 'Status mapping',
      statusMappingHint: "Notion's fifteen statuses collapse onto four internal states.",
    },

    settings: {
      title: 'Settings',
      language: 'Language',
      spanish: 'Español',
      english: 'English',
      deliveryTime: 'Plan delivery time',
      notifications: 'Notifications',
      pushEnabled: 'Daily alert',
      theme: 'Theme',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
      reduceTransparency: 'Reduce transparency',
      reduceTransparencyHint: 'Replaces glass with solid surfaces.',
      signOut: 'Sign out',
      account: 'Account',
    },

    briefing: {
      title: 'Executive briefing',
      generatedAt: (time: string) => `generated today ${time}`,
      topRisks: 'Top risks',
      decisions: 'Pending decisions',
      perspectives: 'Perspectives',
    },

    perspectives: {
      ceo: 'CEO',
      coo: 'COO',
      cto: 'CTO',
      cfo: 'CFO',
      pm: 'PM',
    },

    common: {
      back: 'Back',
      close: 'Close',
      seeAll: 'See all',
      today: 'Today',
      source: 'Source',
      notion: 'Notion',
      app: 'TrueNorth',
    },
  },
} as const;

export type Dictionary = (typeof dictionary)['es'];

export function getDictionary(locale: Locale): Dictionary {
  return dictionary[locale] as Dictionary;
}

/** Costa Rica conventions: "jue 3 sep", 24-hour clock. */
export function formatShortDate(iso: string, locale: Locale): string {
  const date = new Date(`${iso}T12:00:00`);
  const formatted = new Intl.DateTimeFormat(locale === 'es' ? 'es-CR' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
  return formatted.replace(/\.,?/g, '').replace(/,/g, '');
}

export function daysUntil(iso: string, from: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${iso}T00:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

import type {
  Company,
  CompanyAnalysis,
  DailyPlan,
  Membership,
  Objective,
  Project,
  Risk,
  Task,
  User,
  VoiceUpdate,
} from './types';

/**
 * ADITUM's real shape, as reviewed in Notion on 2026-09-03 and drawn in the
 * design canvas. This stands in for Firestore until the backend is wired, and
 * afterwards it stays as the seed for the emulator and for the golden cases.
 */

/** The day the design depicts. Fixed so screens are reproducible. */
export const TODAY = '2026-09-03';

export const users: User[] = [
  {
    id: 'u_esteban',
    displayName: 'Esteban Rojas',
    email: 'esteban@aditumcr.com',
    initials: 'ER',
    timezone: 'America/Costa_Rica',
    notifyHour: 6,
    locale: 'es',
    theme: 'system',
    reduceTransparency: false,
  },
  {
    id: 'u_adriana',
    displayName: 'Adriana Vargas',
    email: 'adriana@aditumcr.com',
    initials: 'AV',
    timezone: 'America/Costa_Rica',
    notifyHour: 7,
    locale: 'es',
    theme: 'system',
    reduceTransparency: false,
  },
  {
    id: 'u_marco',
    displayName: 'Marco Jiménez',
    email: 'marco@aditumcr.com',
    initials: 'MJ',
    timezone: 'America/Costa_Rica',
    notifyHour: 7,
    locale: 'es',
    theme: 'system',
    reduceTransparency: false,
  },
  {
    id: 'u_lucia',
    displayName: 'Lucía Mora',
    email: 'lucia@aditumcr.com',
    initials: 'LM',
    timezone: 'America/Costa_Rica',
    notifyHour: 8,
    locale: 'es',
    theme: 'system',
    reduceTransparency: false,
  },
];

export const companies: Company[] = [
  {
    id: 'c_aditum',
    name: 'ADITUM',
    slug: 'aditum',
    northStar:
      'Convertir ADITUM en la plataforma líder de administración de condominios en Costa Rica para diciembre de 2027.',
    northStarDeadline: '2027-12-31',
    plans: {
      m3: 'Estabilizar la plataforma y cerrar el portal de proveedores.',
      m6: 'Reducir los tickets de soporte 30 % y abrir el segundo canal de venta.',
      m12: 'Cien condominios activos con facturación recurrente.',
    },
  },
];

export const memberships: Membership[] = [
  {
    userId: 'u_esteban',
    companyId: 'c_aditum',
    roleTitle: 'CTO',
    roleDescription:
      'Estabilidad de la plataforma, arquitectura, seguridad, rendimiento y cumplimiento de fechas técnicas.',
    access: 'owner',
    hasAccount: true,
    expectations:
      'El portal de proveedores sale el 30 de septiembre y el cierre de mes deja de tirar errores 500. Que responda los comentarios de su equipo el mismo día.',
  },
  {
    userId: 'u_adriana',
    companyId: 'c_aditum',
    roleTitle: 'Soporte',
    roleDescription: 'Atención de tickets, calidad percibida y escalamiento de incidentes.',
    access: 'member',
    hasAccount: true,
    expectations:
      'Que los tickets mensuales bajen de 240 a 168, y que cada semana me diga cuáles son los motivos que más se repiten.',
  },
  {
    userId: 'u_marco',
    companyId: 'c_aditum',
    roleTitle: 'Desarrollo',
    roleDescription: 'Entrega de funcionalidades del módulo financiero y del portal de proveedores.',
    access: 'member',
    hasAccount: true,
    expectations:
      'Que el cierre financiero corra en menos de dos minutos, y que cada tarea suya en curso tenga un comentario o un cambio de estado al menos cada dos días.',
  },
  {
    userId: 'u_lucia',
    companyId: 'c_aditum',
    roleTitle: 'COO',
    roleDescription: 'Procesos operativos, eficiencia del equipo y relación con los condominios.',
    access: 'admin',
    hasAccount: true,
    expectations:
      'Que todo proyecto activo tenga responsable y fecha al día, revisado cada semana.',
  },
];

export const objectives: Objective[] = [
  {
    id: 'o_tickets',
    companyId: 'c_aditum',
    title: 'Reducir 30 % los tickets de soporte',
    expectedResult:
      'Bajar de 240 a 168 tickets mensuales sosteniendo la misma base de condominios.',
    startDate: '2026-04-01',
    targetDate: '2026-12-15',
    priority: 'high',
    ownerUserId: 'u_adriana',
    progressPct: 38,
    status: 'at_risk',
    history: [
      { date: '2026-06-01', value: 8 },
      { date: '2026-07-01', value: 17 },
      { date: '2026-08-01', value: 27 },
      { date: '2026-08-25', value: 34 },
      { date: '2026-09-03', value: 38 },
    ],
    indicators: [
      {
        id: 'i_tickets',
        name: 'Tickets mensuales',
        unit: 'tickets',
        baseline: 240,
        current: 213,
        target: 168,
        direction: 'down',
        history: [
          { date: '2026-04-01', value: 240 },
          { date: '2026-05-01', value: 236 },
          { date: '2026-06-01', value: 229 },
          { date: '2026-07-01', value: 224 },
          { date: '2026-08-01', value: 218 },
          { date: '2026-09-03', value: 213 },
        ],
      },
      {
        id: 'i_first_response',
        name: 'Primera respuesta',
        unit: 'h',
        baseline: 9,
        current: 5.5,
        target: 4,
        direction: 'down',
      },
    ],
  },
  {
    id: 'o_financiero',
    companyId: 'c_aditum',
    title: 'Estabilizar el módulo financiero',
    expectedResult: 'Cero errores 500 recurrentes y tiempos de cierre bajo dos minutos.',
    startDate: '2026-05-15',
    targetDate: '2026-10-31',
    priority: 'max',
    ownerUserId: 'u_esteban',
    progressPct: 52,
    status: 'at_risk',
    history: [
      { date: '2026-05-15', value: 0 },
      { date: '2026-06-15', value: 14 },
      { date: '2026-07-15', value: 30 },
      { date: '2026-08-15', value: 44 },
      { date: '2026-09-03', value: 52 },
    ],
    indicators: [
      {
        id: 'i_500',
        name: 'Errores 500 por semana',
        unit: 'errores',
        baseline: 34,
        current: 18,
        target: 0,
        direction: 'down',
      },
    ],
  },
  {
    id: 'o_portal',
    companyId: 'c_aditum',
    title: 'Lanzar el portal de proveedores',
    expectedResult:
      'Proveedores con acceso propio por link seguro y seguimiento de sus tareas.',
    startDate: '2026-06-01',
    targetDate: '2026-09-30',
    priority: 'high',
    ownerUserId: 'u_esteban',
    progressPct: 46,
    status: 'at_risk',
    history: [
      { date: '2026-06-01', value: 0 },
      { date: '2026-07-01', value: 14 },
      { date: '2026-07-27', value: 26 },
      { date: '2026-08-10', value: 33 },
      { date: '2026-08-24', value: 40 },
      { date: '2026-09-03', value: 46 },
    ],
    indicators: [
      {
        id: 'i_proveedores',
        name: 'Proveedores activos',
        unit: 'proveedores',
        baseline: 0,
        current: 3,
        target: 40,
        direction: 'up',
      },
    ],
  },
];

export const projects: Project[] = [
  {
    id: 'p_portal',
    companyId: 'c_aditum',
    name: 'Portal de proveedores',
    description: 'Acceso por link seguro, tareas y estados visibles para cada proveedor.',
    visibility: 'company',
    objectiveIds: ['o_portal'],
    memberUserIds: ['u_esteban', 'u_marco'],
    ownerUserId: 'u_esteban',
    startDate: '2026-06-01',
    targetDate: '2026-09-30',
    progressPct: 46,
    status: 'at_risk',
    source: 'notion',
    notionPageId: '3acddbac34cb81e6b4c0ea280b95217b',
  },
  {
    id: 'p_financiero',
    companyId: 'c_aditum',
    name: 'Módulo financiero',
    description: 'Cierre mensual, conciliación y reportes de cuotas.',
    visibility: 'company',
    objectiveIds: ['o_financiero', 'o_tickets'],
    memberUserIds: ['u_esteban', 'u_marco', 'u_adriana'],
    ownerUserId: 'u_marco',
    startDate: '2026-05-15',
    targetDate: '2026-10-31',
    progressPct: 52,
    status: 'at_risk',
    source: 'notion',
  },
  {
    id: 'p_sentry',
    companyId: 'c_aditum',
    name: 'Monitoreo en Sentry',
    description: 'Cuenta, proyectos y alertas para ver los errores antes que el cliente.',
    visibility: 'company',
    objectiveIds: ['o_financiero'],
    memberUserIds: ['u_esteban'],
    ownerUserId: 'u_esteban',
    startDate: '2026-07-01',
    targetDate: '2026-09-15',
    progressPct: 20,
    status: 'at_risk',
    source: 'notion',
    notionPageId: '37dddbac34cb81908340fbc18787638c',
  },
  {
    id: 'p_passkeys',
    companyId: 'c_aditum',
    name: 'Inicio de sesión con passkeys',
    description: 'Reemplazo de contraseñas por passkeys en la app de condóminos.',
    visibility: 'company',
    objectiveIds: [],
    memberUserIds: ['u_marco'],
    ownerUserId: 'u_marco',
    startDate: '2026-08-01',
    targetDate: '2026-11-30',
    progressPct: 12,
    status: 'on_track',
    source: 'notion',
    notionPageId: '3c9ddbac34cb81f6a7c1f5318ea1e9a5',
  },
];

export const tasks: Task[] = [
  {
    id: 't_966',
    companyId: 'c_aditum',
    projectId: 'p_portal',
    code: 'TAR-966',
    title: 'Portal de proveedores con link seguro: acceso y tareas',
    status: 'in_progress',
    notionStatus: 'En curso',
    priority: 'max',
    dueDate: '2026-09-03',
    assigneeUserIds: ['u_esteban'],
    dependsOn: [],
    source: 'notion',
    notionPageId: '3acddbac34cb81e6b4c0ea280b95217b',
    syncedAt: '2026-09-03T05:02:00-06:00',
    updatedAt: '2026-08-29T16:40:00-06:00',
    notionLastEditedAt: '2026-08-29T16:40:00-06:00',
    statusChangedAt: '2026-08-21T10:14:00-06:00',
    commentCount: 3,
    lastCommentAt: '2026-08-29T16:40:00-06:00',
    lastCommentBy: 'u_adriana',
    comments: [
      {
        id: 'cm_966_1',
        authorUserId: 'u_adriana',
        authorName: 'Adriana Vargas',
        createdAt: '2026-08-29T16:40:00-06:00',
        text: 'Dos condominios ya preguntaron por el acceso de proveedores. ¿Sigue para el 30?',
      },
    ],
  },
  {
    id: 't_842',
    companyId: 'c_aditum',
    projectId: 'p_sentry',
    code: 'TAR-842',
    title: 'Sentry: crear cuenta, proyectos y alertas en sentry.io',
    status: 'todo',
    notionStatus: 'Sin empezar',
    priority: 'high',
    dueDate: '2026-08-28',
    assigneeUserIds: ['u_esteban'],
    dependsOn: [],
    source: 'notion',
    notionPageId: '37dddbac34cb81908340fbc18787638c',
    syncedAt: '2026-09-03T05:02:00-06:00',
    updatedAt: '2026-08-14T11:02:00-06:00',
    notionLastEditedAt: '2026-08-14T11:02:00-06:00',
    statusChangedAt: '2026-08-14T11:02:00-06:00',
    commentCount: 0,
  },
  {
    id: 't_931',
    companyId: 'c_aditum',
    projectId: 'p_financiero',
    code: 'TAR-931',
    title: 'Errores 500 recurrentes en cierre de mes',
    status: 'in_progress',
    notionStatus: 'Bug - Incidente',
    priority: 'max',
    dueDate: '2026-08-25',
    assigneeUserIds: ['u_marco'],
    dependsOn: [],
    source: 'notion',
    syncedAt: '2026-09-03T05:02:00-06:00',
    updatedAt: '2026-08-27T09:30:00-06:00',
    notionLastEditedAt: '2026-08-27T09:30:00-06:00',
    statusChangedAt: '2026-08-18T08:05:00-06:00',
    commentCount: 2,
    lastCommentAt: '2026-08-27T09:30:00-06:00',
    lastCommentBy: 'u_esteban',
    comments: [
      {
        id: 'cm_931_1',
        authorUserId: 'u_esteban',
        authorName: 'Esteban Rojas',
        createdAt: '2026-08-27T09:30:00-06:00',
        text: '¿Encontraste el patrón del 500? Si es el timeout de conciliación lo vemos juntos.',
      },
    ],
  },
  {
    id: 't_947',
    companyId: 'c_aditum',
    projectId: 'p_financiero',
    code: 'TAR-947',
    title: 'Stress test del cierre financiero',
    status: 'todo',
    notionStatus: 'Sin empezar',
    priority: 'high',
    dueDate: null,
    assigneeUserIds: [],
    dependsOn: ['t_931'],
    source: 'notion',
    syncedAt: '2026-09-03T05:02:00-06:00',
  },
  {
    id: 't_952',
    companyId: 'c_aditum',
    projectId: 'p_portal',
    code: 'TAR-952',
    title: 'Notificaciones al proveedor por correo',
    status: 'blocked',
    notionStatus: 'Depende de otra TAR',
    priority: 'medium',
    dueDate: '2026-09-12',
    assigneeUserIds: ['u_marco'],
    dependsOn: ['t_966'],
    source: 'notion',
    syncedAt: '2026-09-03T05:02:00-06:00',
    updatedAt: '2026-08-15T09:00:00-06:00',
    notionLastEditedAt: '2026-08-15T09:00:00-06:00',
    statusChangedAt: '2026-08-15T09:00:00-06:00',
    commentCount: 0,
  },
  {
    id: 't_958',
    companyId: 'c_aditum',
    projectId: 'p_financiero',
    code: 'TAR-958',
    title: 'Revisar tickets del módulo financiero',
    status: 'todo',
    notionStatus: 'Sin empezar',
    priority: 'high',
    dueDate: '2026-09-03',
    assigneeUserIds: ['u_esteban'],
    dependsOn: [],
    source: 'notion',
    syncedAt: '2026-09-03T05:02:00-06:00',
  },
  {
    id: 't_970',
    companyId: 'c_aditum',
    projectId: 'p_passkeys',
    code: 'TAR-970',
    title: 'Prototipo de registro con passkey',
    status: 'in_progress',
    notionStatus: 'Pruebas - Desarrollo',
    priority: 'low',
    dueDate: '2026-09-20',
    assigneeUserIds: ['u_marco'],
    dependsOn: [],
    source: 'notion',
    syncedAt: '2026-09-03T05:02:00-06:00',
    updatedAt: '2026-08-27T14:30:00-06:00',
    notionLastEditedAt: '2026-08-27T14:30:00-06:00',
    statusChangedAt: '2026-08-27T14:30:00-06:00',
    commentCount: 0,
  },
  {
    id: 't_939',
    companyId: 'c_aditum',
    projectId: 'p_financiero',
    code: 'TAR-939',
    title: 'Guía de conciliación para soporte',
    status: 'in_progress',
    notionStatus: 'Revisión Tecnica',
    priority: 'medium',
    dueDate: '2026-09-08',
    assigneeUserIds: ['u_adriana'],
    dependsOn: [],
    source: 'notion',
    syncedAt: '2026-09-03T05:02:00-06:00',
    updatedAt: '2026-09-02T09:15:00-06:00',
    notionLastEditedAt: '2026-09-02T09:15:00-06:00',
    statusChangedAt: '2026-09-02T09:15:00-06:00',
    commentCount: 1,
    lastCommentAt: '2026-09-02T09:15:00-06:00',
    lastCommentBy: 'u_adriana',
    comments: [
      {
        id: 'cm_939_1',
        authorUserId: 'u_adriana',
        authorName: 'Adriana Vargas',
        createdAt: '2026-09-02T09:15:00-06:00',
        text: 'Ya quedó el borrador, lo paso a revisión técnica hoy.',
      },
    ],
  },
];

export const risks: Risk[] = [
  {
    id: 'r_launch',
    companyId: 'c_aditum',
    projectId: 'p_portal',
    description: 'El lanzamiento del portal depende de una sola tarea en ruta crítica.',
    severity: 'high',
    ownerUserId: 'u_esteban',
    source: 'engine',
  },
  {
    id: 'r_monitoring',
    companyId: 'c_aditum',
    projectId: 'p_sentry',
    description: 'Sin monitoreo, los errores del módulo financiero los reporta el cliente.',
    severity: 'high',
    ownerUserId: 'u_esteban',
    source: 'engine',
  },
  {
    id: 'r_decision_vercel',
    companyId: 'c_aditum',
    description: 'Decisión pendiente hace 6 días: aprobar el plan de monitoreo.',
    severity: 'medium',
    ownerUserId: 'u_esteban',
    source: 'manual',
  },
];

export const todaysPlan: DailyPlan = {
  id: `${TODAY}_u_esteban`,
  companyId: 'c_aditum',
  userId: 'u_esteban',
  date: TODAY,
  headline: 'Desbloquea el portal de proveedores: revisa el link seguro de TAR-966.',
  // Reads after the objective link: "Por qué: <objetivo> va detrás del plan."
  why: 'va detrás del plan.',
  items: [
    {
      title: 'Portal de proveedores con link seguro',
      why: 'Única tarea en ruta crítica del lanzamiento.',
      objectiveId: 'o_portal',
      projectId: 'p_portal',
      taskId: 't_966',
      estimatedMinutes: 45,
      signalIds: ['due_today:t_966'],
    },
    {
      title: 'Sentry: crear cuenta, proyectos y alertas',
      why: 'Requisito para monitorear producción.',
      objectiveId: 'o_financiero',
      projectId: 'p_sentry',
      taskId: 't_842',
      estimatedMinutes: 30,
      signalIds: ['overdue:t_842'],
    },
    {
      title: 'Revisar tickets del módulo financiero',
      why: 'Tres tareas vencidas concentradas en el mismo módulo.',
      objectiveId: 'o_tickets',
      projectId: 'p_financiero',
      taskId: 't_958',
      estimatedMinutes: 25,
      deadlineTime: '14:00',
      signalIds: ['overdue:t_931'],
    },
  ],
  consequenceIfNotDone: 'el lanzamiento se atrasa 4 días',
  deliveredAt: `${TODAY}T06:30:00-06:00`,
  stale: false,
  feedback: {},
};

export const todaysAnalysis: CompanyAnalysis = {
  id: TODAY,
  companyId: 'c_aditum',
  date: TODAY,
  generatedAt: `${TODAY}T05:12:00-06:00`,
  briefing:
    'Los tres objetivos avanzan, pero el portal de proveedores concentra el riesgo: una sola tarea en ruta crítica sostiene la fecha de setiembre. El módulo financiero mejoró los errores 500 a la mitad y sigue sin monitoreo propio, así que la mejora no se puede sostener con evidencia. Soporte va bien en primera respuesta y flojo en volumen.',
  topRisks: [
    'El portal de proveedores depende de TAR-966, vencida hoy y sin respaldo.',
    'Sin Sentry, los errores del módulo financiero los sigue reportando el cliente.',
    'El stress test del cierre financiero no tiene responsable ni fecha.',
  ],
  pendingDecisions: [
    'Aprobar el plan de monitoreo en producción.',
    'Definir si passkeys entra al trimestre o se pospone.',
  ],
  perspectives: [
    {
      key: 'ceo',
      reading:
        'La meta de diciembre de 2027 sigue viable, pero el trimestre se está gastando en estabilidad y no en crecimiento. Conviene decidir si passkeys espera.',
    },
    {
      key: 'coo',
      reading:
        'La carga está concentrada en dos personas. Marco lleva cuatro tareas abiertas y el resto del equipo va por debajo del promedio.',
    },
    {
      key: 'cto',
      reading:
        'Deuda visible: errores 500 recurrentes, sin monitoreo y sin stress test asignado. El portal no puede lanzarse sin cerrar TAR-966.',
    },
    {
      key: 'cfo',
      reading:
        'El costo de soporte baja despacio. Cada mes con 213 tickets sostiene horas que no se facturan.',
    },
    {
      key: 'pm',
      reading:
        'Dos proyectos con fecha en setiembre y una brecha de 18 puntos. Passkeys no está ligado a ningún objetivo y consume a Marco.',
    },
  ],
  model: 'claude-opus-5',
  costUsd: 0.24,
};

/** The dictation shown in the design: three changes, one of them in conflict. */
export const sampleVoiceUpdate: VoiceUpdate = {
  id: 'v_demo',
  companyId: 'c_aditum',
  userId: 'u_esteban',
  createdAt: `${TODAY}T09:14:00-06:00`,
  status: 'review',
  transcript:
    'Ya terminé el link seguro del portal, la TAR-966 pasa a pruebas QA. La 842 de Sentry la dejo bloqueada porque falta la cuenta, y el stress test lo mueve Marco para el 12 de setiembre.',
  changes: [
    {
      taskId: 't_966',
      taskCode: 'TAR-966',
      taskTitle: 'Portal de proveedores con link seguro',
      field: 'status',
      from: 'En curso',
      to: 'Pruebas QA',
      quote: 'la TAR-966 pasa a pruebas QA',
    },
    {
      taskId: 't_842',
      taskCode: 'TAR-842',
      taskTitle: 'Sentry: crear cuenta, proyectos y alertas',
      field: 'status',
      from: 'Sin empezar',
      to: 'Depende de otra TAR',
      quote: 'la 842 de Sentry la dejo bloqueada porque falta la cuenta',
      conflict: true,
    },
    {
      taskId: 't_947',
      taskCode: 'TAR-947',
      taskTitle: 'Stress test del cierre financiero',
      field: 'dueDate',
      from: 'sin fecha',
      to: '2026-09-12',
      quote: 'el stress test lo mueve Marco para el 12 de setiembre',
    },
  ],
  discarded: [],
  notionWriteStatus: 'pending',
};

/**
 * A short run of past days, so the briefing calendar has something to show from
 * the first launch. Sample data, like everything else in this file: real
 * history starts accumulating the day the engine runs.
 */
export const pastPlans: {
  date: string;
  headline: string;
  why: string;
  items: { title: string; why: string; estimatedMinutes: number; signalIds: string[] }[];
  consequenceIfNotDone: string;
  feedback: Record<number, 'done' | 'skipped' | 'irrelevant'>;
}[] = [
  {
    date: '2026-09-02',
    headline: 'Cerrá el link seguro del portal antes del jueves.',
    why: 'es la única tarea en ruta crítica.',
    items: [
      {
        title: 'Portal de proveedores con link seguro',
        why: 'Bloquea el lanzamiento de setiembre.',
        estimatedMinutes: 90,
        signalIds: ['due_today:t_966'],
      },
      {
        title: 'Revisar los errores 500 más frecuentes',
        why: 'Tres tareas vencidas en el mismo módulo.',
        estimatedMinutes: 45,
        signalIds: ['overdue:t_931'],
      },
      {
        title: 'Asignar responsable al stress test',
        why: 'Sin responsable no avanza.',
        estimatedMinutes: 10,
        signalIds: ['unassigned:t_947'],
      },
    ],
    consequenceIfNotDone: 'el portal pierde la fecha de setiembre',
    feedback: { 0: 'done', 1: 'done', 2: 'skipped' },
  },
  {
    date: '2026-09-01',
    headline: 'Empezá la semana desbloqueando el monitoreo.',
    why: 'sin Sentry no se puede sostener la mejora del módulo financiero.',
    items: [
      {
        title: 'Sentry: crear cuenta y proyectos',
        why: 'Requisito para ver los errores antes que el cliente.',
        estimatedMinutes: 30,
        signalIds: ['overdue:t_842'],
      },
      {
        title: 'Revisar el avance del portal con Marco',
        why: 'La brecha creció otra vez la semana pasada.',
        estimatedMinutes: 25,
        signalIds: ['gap:o_portal'],
      },
    ],
    consequenceIfNotDone: 'la semana arranca sin visibilidad de errores',
    feedback: { 0: 'skipped', 1: 'done' },
  },
  {
    date: '2026-08-29',
    headline: 'Dejá el stress test con fecha antes del fin de semana.',
    why: 'es lo único que separa al módulo financiero de cerrar.',
    items: [
      {
        title: 'Definir alcance del stress test',
        why: 'La tarea existe pero no tiene fecha ni responsable.',
        estimatedMinutes: 40,
        signalIds: ['undated:t_947'],
      },
      {
        title: 'Cerrar dos tickets del módulo financiero',
        why: 'Bajan el volumen del objetivo de soporte.',
        estimatedMinutes: 50,
        signalIds: ['overdue:t_931'],
      },
      {
        title: 'Actualizar el avance del portal',
        why: 'Nueve días sin reportar.',
        estimatedMinutes: 10,
        signalIds: ['gap:o_portal'],
      },
    ],
    consequenceIfNotDone: 'el cierre del módulo se corre otra semana',
    feedback: { 0: 'done', 1: 'done', 2: 'done' },
  },
  {
    date: '2026-08-28',
    headline: 'Atendé los errores 500 antes de que lleguen a soporte.',
    why: 'la mitad de los tickets del mes salen de ahí.',
    items: [
      {
        title: 'Reproducir el error 500 del cierre',
        why: 'Es el más recurrente de la semana.',
        estimatedMinutes: 60,
        signalIds: ['overdue:t_931'],
      },
      {
        title: 'Responder los tickets escalados',
        why: 'Primera respuesta por encima de las 5 horas.',
        estimatedMinutes: 30,
        signalIds: ['gap:o_tickets'],
      },
    ],
    consequenceIfNotDone: 'el volumen de tickets no baja este mes',
    feedback: { 0: 'done' },
  },
];

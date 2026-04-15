export const queryKeys = {
  leads: {
    all: ['leads'] as const,
    list: (filters?: object) => ['leads', 'list', filters] as const,
    detail: (id: string) => ['leads', 'detail', id] as const,
  },

  contacts: {
    all: ['contacts'] as const,
    list: (filters?: object) => ['contacts', 'list', filters] as const,
    detail: (id: string) => ['contacts', 'detail', id] as const,
  },

  companies: {
    all: ['companies'] as const,
    list: (filters?: object) => ['companies', 'list', filters] as const,
    detail: (id: string) => ['companies', 'detail', id] as const,
  },

  deals: {
    all: ['deals'] as const,
    list: (filters?: object) => ['deals', 'list', filters] as const,
    detail: (id: string) => ['deals', 'detail', id] as const,
    kanban: (pipelineId: string) => ['deals', 'kanban', pipelineId] as const,
    forecast: ['deals', 'forecast'] as const,
  },

  pipelines: {
    all: ['pipelines'] as const,
    list: (filters?: object) => ['pipelines', 'list', filters] as const,
    detail: (id: string) => ['pipelines', 'detail', id] as const,
    stages: (pipelineId: string) => ['pipelines', 'stages', pipelineId] as const,
  },

  tasks: {
    all: ['tasks'] as const,
    list: (filters?: object) => ['tasks', 'list', filters] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
    myTasks: (userId: string) => ['tasks', 'my', userId] as const,
  },

  activities: {
    all: ['activities'] as const,
    list: (filters?: object) => ['activities', 'list', filters] as const,
    detail: (id: string) => ['activities', 'detail', id] as const,
    timeline: (entityType: string, entityId: string) =>
      ['activities', 'timeline', entityType, entityId] as const,
  },

  communications: {
    all: ['communications'] as const,
    list: (filters?: object) => ['communications', 'list', filters] as const,
    detail: (id: string) => ['communications', 'detail', id] as const,
    contactTimeline: (contactId: string) =>
      ['communications', 'contact-timeline', contactId] as const,
  },

  tickets: {
    all: ['tickets'] as const,
    list: (filters?: object) => ['tickets', 'list', filters] as const,
    detail: (id: string) => ['tickets', 'detail', id] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: (userId: string) => ['notifications', 'list', userId] as const,
    unreadCount: (userId: string) => ['notifications', 'unread-count', userId] as const,
  },

  analytics: {
    dashboard: ['analytics', 'dashboard'] as const,
    revenue: ['analytics', 'revenue'] as const,
    leadSources: ['analytics', 'lead-sources'] as const,
    salesPerformance: ['analytics', 'sales-performance'] as const,
    pipelineFunnel: ['analytics', 'pipeline-funnel'] as const,
  },

  users: {
    all: ['users'] as const,
    list: (filters?: object) => ['users', 'list', filters] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
    profile: (id: string) => ['users', 'profile', id] as const,
    me: ['users', 'me'] as const,
  },

  emailTemplates: {
    all: ['email-templates'] as const,
    list: (filters?: object) => ['email-templates', 'list', filters] as const,
    detail: (id: string) => ['email-templates', 'detail', id] as const,
  },

  billing: {
    info: ['billing', 'info'] as const,
    plans: ['billing', 'plans'] as const,
    usage: ['billing', 'usage'] as const,
  },

  blockchain: {
    all: ['blockchain'] as const,
    record: (dealId: string) => ['blockchain', 'record', dealId] as const,
    verify: (dealId: string) => ['blockchain', 'verify', dealId] as const,
  },
};


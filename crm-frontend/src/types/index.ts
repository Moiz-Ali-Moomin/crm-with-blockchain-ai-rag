// ─── Enums / Literal Types ────────────────────────────────────────────────────

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'SALES_MANAGER'
  | 'SALES_REP'
  | 'SUPPORT_AGENT'
  | 'VIEWER';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'INVITED' | 'SUSPENDED';

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'UNQUALIFIED'
  | 'NURTURING'
  | 'CONVERTED'
  | 'LOST';

export type LeadSource =
  | 'WEBSITE'
  | 'REFERRAL'
  | 'SOCIAL_MEDIA'
  | 'EMAIL_CAMPAIGN'
  | 'GOOGLE_ADS'
  | 'FACEBOOK_ADS'
  | 'COLD_CALL'
  | 'TRADE_SHOW'
  | 'PARTNER'
  | 'OTHER';

export type DealStatus = 'OPEN' | 'WON' | 'LOST' | 'ON_HOLD';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type TicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'RESOLVED'
  | 'CLOSED';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type ActivityType =
  | 'CALL'
  | 'EMAIL'
  | 'MEETING'
  | 'NOTE'
  | 'TASK'
  | 'SMS'
  | 'WHATSAPP';

export type EntityType = 'LEAD' | 'CONTACT' | 'COMPANY' | 'DEAL' | 'TICKET';

export type CommunicationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PHONE';
export type CommunicationDirection = 'INBOUND' | 'OUTBOUND';
export type CommunicationStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'RECEIVED';

export type IntegrationType =
  | 'STRIPE'
  | 'GOOGLE_ADS'
  | 'FACEBOOK_ADS'
  | 'ZAPIER'
  | 'SLACK'
  | 'CUSTOM';

// ─── Core Models ──────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  plan: string;
  isActive: boolean;
  settings: Record<string, unknown>;
  createdAt: string;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  jobTitle?: string;
  phone?: string;
  avatar?: string;
  timezone: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  companyName?: string;
  website?: string;
  status: LeadStatus;
  source: LeadSource;
  score: number;
  notes?: string;
  tags: string[];
  customFields: Record<string, unknown>;
  assigneeId?: string;
  assignee?: User;
  createdById: string;
  createdBy?: User;
  convertedAt?: string;
  convertedToId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  companyId?: string;
  company?: Company;
  totalSpent: number;
  lastContactedAt?: string;
  fromLeadId?: string;
  tags: string[];
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  tenantId: string;
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  employeeCount?: number;
  annualRevenue?: number;
  description?: string;
  ownerId?: string;
  owner?: User;
  tags: string[];
  contacts?: Contact[];
  deals?: Deal[];
  createdAt: string;
  updatedAt: string;
}

export interface Pipeline {
  id: string;
  tenantId: string;
  name: string;
  isDefault: boolean;
  stages: Stage[];
  createdAt: string;
}

export interface Stage {
  id: string;
  pipelineId: string;
  tenantId: string;
  name: string;
  position: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  color?: string;
  deals?: Deal[];
  _count?: { deals: number };
  createdAt: string;
}

export interface Deal {
  id: string;
  tenantId: string;
  title: string;
  value: number;
  currency?: string;
  status: DealStatus;
  pipelineId: string;
  pipeline?: Pipeline;
  stageId: string;
  stage?: Stage;
  contactId?: string;
  contact?: Contact;
  companyId?: string;
  company?: Company;
  ownerId?: string;
  owner?: User;
  description?: string;
  closingDate?: string;
  wonAt?: string;
  lostAt?: string;
  lostReason?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DealStageHistory {
  id: string;
  dealId: string;
  fromStageId?: string;
  fromStage?: Stage;
  toStageId: string;
  toStage: Stage;
  movedById: string;
  movedBy?: User;
  movedAt: string;
}

export interface Activity {
  id: string;
  tenantId: string;
  type: ActivityType;
  entityType: EntityType;
  entityId: string;
  subject: string;
  body?: string;
  duration?: number;
  outcome?: string;
  scheduledAt?: string;
  completedAt?: string;
  createdById: string;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  reminderAt?: string;
  entityType?: EntityType;
  entityId?: string;
  assigneeId?: string;
  assignee?: User;
  createdById: string;
  createdBy?: User;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Communication {
  id: string;
  tenantId: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  status: CommunicationStatus;
  fromAddr: string;
  toAddr: string;
  subject?: string;
  body: string;
  templateId?: string;
  contactId?: string;
  contact?: Contact;
  externalId?: string;
  sentAt?: string;
  createdAt: string;
}

export interface EmailTemplate {
  id: string;
  tenantId: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  variables: string[];
  isActive: boolean;
  category?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  tenantId: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  contactId?: string;
  contact?: Contact;
  assigneeId?: string;
  assignee?: User;
  createdById: string;
  replies?: TicketReply[];
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketReply {
  id: string;
  ticketId: string;
  body: string;
  authorId: string;
  author: User;
  isInternal: boolean;
  createdAt: string;
}

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>[];
  runCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Integration {
  id: string;
  tenantId: string;
  type: IntegrationType;
  name: string;
  isActive: boolean;
  settings: Record<string, unknown>;
  createdAt: string;
}

export interface BillingInfo {
  id: string;
  tenantId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  plan: string;
  status: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  userId?: string;
  user?: User;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

// ─── API Response Shapes ──────────────────────────────────────────────────────

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  timestamp: string;
  requestId: string;
}

export interface PaginatedData<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  totalLeads: number;
  newLeadsThisMonth: number;
  leadsGrowth: number;
  totalContacts: number;
  openDeals: number;
  totalDealValue: number;
  wonDealsThisMonth: number;
  wonDealValue: number;
  conversionRate: number;
  openTickets: number;
  avgDealSize: number;
  revenueThisMonth: number;
  revenueGrowth: number;
}

export interface RevenueDataPoint {
  month: string;
  revenue: number;
  deals: number;
}

export interface LeadSourceData {
  source: string;
  count: number;
  percentage: number;
}

export interface PipelineFunnelStage {
  stage: string;
  count: number;
  value: number;
  conversionRate: number;
}

export interface SalesRepPerformance {
  userId: string;
  name: string;
  dealsWon: number;
  revenue: number;
  leadsConverted: number;
}

/** Typed payload item for Recharts Pie chart tooltips. */
export interface PiePayloadItem {
  name: string;
  value: number;
  payload: {
    source: string;
    count: number;
    percentage: number;
  };
}


// ─── Kanban Board ─────────────────────────────────────────────────────────────

export interface KanbanBoard {
  pipelineId: string;
  stages: KanbanColumn[];
}

export interface KanbanColumn {
  stage: Stage;
  deals: Deal[];
  totalValue: number;
  count: number;
}

// ─── Form / Filter Types ──────────────────────────────────────────────────────

export interface LeadFilters {
  search?: string;
  status?: LeadStatus;
  source?: LeadSource;
  assigneeId?: string;
  minScore?: number;
  maxScore?: number;
  page?: number;
  limit?: number;
}

export interface DealFilters {
  search?: string;
  status?: DealStatus;
  pipelineId?: string;
  stageId?: string;
  ownerId?: string;
  page?: number;
  limit?: number;
}

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  entityType?: EntityType;
  entityId?: string;
  page?: number;
  limit?: number;
}

export interface TicketFilters {
  search?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  page?: number;
  limit?: number;
}

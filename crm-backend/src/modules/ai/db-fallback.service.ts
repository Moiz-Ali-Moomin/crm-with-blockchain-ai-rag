/**
 * DbFallbackService
 *
 * When pgvector returns no results for a RAG query, this service fetches
 * real CRM records directly from Postgres and formats them as LLM context.
 *
 * After the LLM answers, the caller enqueues BullMQ embedding jobs for
 * each fetched record so the next identical (or similar) query hits pgvector
 * instantly instead of falling back to the DB again.
 *
 * Intent detection is keyword-based and intentionally simple — the goal is
 * coverage, not perfection. Unrecognised queries fall through with an empty
 * context and the caller uses the generic fallback system prompt.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EmbeddingJobPayload } from './ai.dto';

export interface DbFallbackResult {
  context: string;
  /** Records to embed after the LLM call so future queries hit pgvector */
  embeddingJobs: Omit<EmbeddingJobPayload, 'action'>[];
}

// ─── Intent keywords ─────────────────────────────────────────────────────────

const INTENT: Record<string, string[]> = {
  deal:         ['deal', 'deals', 'pipeline', 'closing', 'close', 'won', 'lost', 'revenue', 'earning', 'earnings', 'income', 'sale', 'sales', 'opportunity'],
  lead:         ['lead', 'leads', 'prospect', 'prospects', 'score', 'qualified'],
  contact:      ['contact', 'contacts', 'customer', 'customers', 'client', 'clients', 'person'],
  ticket:       ['ticket', 'tickets', 'support', 'issue', 'issues', 'complaint', 'bug', 'problem'],
  activity:     ['activity', 'activities', 'meeting', 'call', 'task', 'follow', 'follow-up', 'note'],
  communication:['email', 'emails', 'message', 'messages', 'communication', 'sent', 'received'],
};

function detectIntents(query: string): Set<string> {
  const lower = query.toLowerCase();
  const found = new Set<string>();
  for (const [intent, keywords] of Object.entries(INTENT)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      found.add(intent);
    }
  }
  // Default: try deals + leads when nothing matched (most common dashboard query)
  if (found.size === 0) {
    found.add('deal');
    found.add('lead');
  }
  return found;
}

// ─── "This month" date range ──────────────────────────────────────────────────

function thisMonthRange() {
  const now = new Date();
  return {
    gte: new Date(now.getFullYear(), now.getMonth(), 1),
    lt:  new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

function isThisMonthQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return lower.includes('this month') || lower.includes('current month') || lower.includes('monthly');
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDeal(d: any): string {
  const parts = [
    `Deal: ${d.title}`,
    `Value: ${d.currency} ${Number(d.value).toLocaleString()}`,
    `Status: ${d.status}`,
  ];
  if (d.stage?.name)       parts.push(`Stage: ${d.stage.name}`);
  if (d.pipeline?.name)    parts.push(`Pipeline: ${d.pipeline.name}`);
  if (d.closingDate)       parts.push(`Closing: ${new Date(d.closingDate).toLocaleDateString()}`);
  if (d.owner)             parts.push(`Owner: ${d.owner.firstName} ${d.owner.lastName}`);
  if (d.contact)           parts.push(`Contact: ${d.contact.firstName} ${d.contact.lastName}`);
  if (d.company)           parts.push(`Company: ${d.company.name}`);
  return parts.join(' | ');
}

function fmtLead(l: any): string {
  const parts = [
    `Lead: ${l.firstName} ${l.lastName}`,
    `Status: ${l.status}`,
    `Score: ${l.score}`,
    `Source: ${l.source}`,
  ];
  if (l.companyName)   parts.push(`Company: ${l.companyName}`);
  if (l.email)         parts.push(`Email: ${l.email}`);
  if (l.assignee)      parts.push(`Assignee: ${l.assignee.firstName} ${l.assignee.lastName}`);
  if (l.notes)         parts.push(`Notes: ${l.notes.slice(0, 120)}`);
  return parts.join(' | ');
}

function fmtContact(c: any): string {
  const parts = [`Contact: ${c.firstName} ${c.lastName}`];
  if (c.email)         parts.push(`Email: ${c.email}`);
  if (c.company)       parts.push(`Company: ${c.company.name}`);
  if (c.jobTitle)      parts.push(`Title: ${c.jobTitle}`);
  if (c.status)        parts.push(`Status: ${c.status}`);
  return parts.join(' | ');
}

function fmtTicket(t: any): string {
  const parts = [
    `Ticket: ${t.subject}`,
    `Status: ${t.status}`,
    `Priority: ${t.priority}`,
  ];
  if (t.contact)       parts.push(`Customer: ${t.contact.firstName} ${t.contact.lastName}`);
  if (t.description)   parts.push(`Description: ${t.description.slice(0, 200)}`);
  return parts.join(' | ');
}

function fmtActivity(a: any): string {
  const parts = [
    `Activity: ${a.type}`,
    `Subject: ${a.subject}`,
    `Status: ${a.status}`,
  ];
  if (a.scheduledAt)   parts.push(`Scheduled: ${new Date(a.scheduledAt).toLocaleDateString()}`);
  if (a.notes)         parts.push(`Notes: ${a.notes.slice(0, 120)}`);
  return parts.join(' | ');
}

function fmtCommunication(c: any): string {
  const parts = [
    `Communication: ${c.channel}`,
    `Subject: ${c.subject ?? '(no subject)'}`,
    `Direction: ${c.direction}`,
  ];
  if (c.contact)       parts.push(`Contact: ${c.contact.firstName} ${c.contact.lastName}`);
  if (c.body)          parts.push(`Body: ${c.body.slice(0, 200)}`);
  return parts.join(' | ');
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class DbFallbackService {
  private readonly logger = new Logger(DbFallbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async fetchContext(tenantId: string, query: string): Promise<DbFallbackResult> {
    const intents   = detectIntents(query);
    const thisMonth = isThisMonthQuery(query);
    const monthRange = thisMonthRange();

    const sections:       string[]                               = [];
    const embeddingJobs:  Omit<EmbeddingJobPayload, 'action'>[] = [];

    await Promise.all([
      // ── Deals ────────────────────────────────────────────────────────────
      intents.has('deal') && this.prisma.withoutTenantScope(() =>
        this.prisma.deal.findMany({
          where: {
            tenantId,
            ...(thisMonth ? { closingDate: monthRange } : {}),
          },
          include: {
            stage:    true,
            pipeline: true,
            owner:    { select: { firstName: true, lastName: true } },
            contact:  { select: { firstName: true, lastName: true } },
            company:  { select: { name: true } },
          },
          orderBy: { value: 'desc' },
          take: 15,
        }),
      ).then((deals) => {
        if (!deals?.length) return;
        sections.push(`## Deals\n${deals.map(fmtDeal).join('\n')}`);
        for (const d of deals) {
          const content = fmtDeal(d);
          embeddingJobs.push({ tenantId, entityType: 'deal', entityId: d.id, content, metadata: { title: d.title, status: d.status } });
        }
      }),

      // ── Leads ────────────────────────────────────────────────────────────
      intents.has('lead') && this.prisma.withoutTenantScope(() =>
        this.prisma.lead.findMany({
          where: {
            tenantId,
            ...(thisMonth ? { createdAt: monthRange } : {}),
          },
          include: {
            assignee: { select: { firstName: true, lastName: true } },
          },
          orderBy: { score: 'desc' },
          take: 15,
        }),
      ).then((leads) => {
        if (!leads?.length) return;
        sections.push(`## Leads\n${leads.map(fmtLead).join('\n')}`);
        for (const l of leads) {
          const content = fmtLead(l);
          embeddingJobs.push({ tenantId, entityType: 'lead', entityId: l.id, content, metadata: { status: l.status, score: l.score } });
        }
      }),

      // ── Contacts ─────────────────────────────────────────────────────────
      intents.has('contact') && this.prisma.withoutTenantScope(() =>
        this.prisma.contact.findMany({
          where: { tenantId },
          include: { company: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 15,
        }),
      ).then((contacts) => {
        if (!contacts?.length) return;
        sections.push(`## Contacts\n${contacts.map(fmtContact).join('\n')}`);
        for (const c of contacts) {
          const content = fmtContact(c);
          embeddingJobs.push({ tenantId, entityType: 'contact', entityId: c.id, content, metadata: {} });
        }
      }),

      // ── Tickets ──────────────────────────────────────────────────────────
      intents.has('ticket') && this.prisma.withoutTenantScope(() =>
        this.prisma.ticket.findMany({
          where: { tenantId, status: { not: 'CLOSED' } },
          include: { contact: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 15,
        }),
      ).then((tickets) => {
        if (!tickets?.length) return;
        sections.push(`## Tickets\n${tickets.map(fmtTicket).join('\n')}`);
        for (const t of tickets) {
          const content = fmtTicket(t);
          embeddingJobs.push({ tenantId, entityType: 'ticket', entityId: t.id, content, metadata: { status: t.status, priority: t.priority } });
        }
      }),

      // ── Activities ───────────────────────────────────────────────────────
      intents.has('activity') && this.prisma.withoutTenantScope(() =>
        this.prisma.activity.findMany({
          where: { tenantId },
          orderBy: { scheduledAt: 'desc' },
          take: 15,
        }),
      ).then((activities) => {
        if (!activities?.length) return;
        sections.push(`## Activities\n${activities.map(fmtActivity).join('\n')}`);
        for (const a of activities) {
          const content = fmtActivity(a);
          embeddingJobs.push({ tenantId, entityType: 'activity', entityId: a.id, content, metadata: { type: a.type } });
        }
      }),

      // ── Communications ───────────────────────────────────────────────────
      intents.has('communication') && this.prisma.withoutTenantScope(() =>
        this.prisma.communication.findMany({
          where: { tenantId },
          include: { contact: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 15,
        }),
      ).then((comms) => {
        if (!comms?.length) return;
        sections.push(`## Communications\n${comms.map(fmtCommunication).join('\n')}`);
        for (const c of comms) {
          const content = fmtCommunication(c);
          embeddingJobs.push({ tenantId, entityType: 'communication', entityId: c.id, content, metadata: { channel: c.channel } });
        }
      }),
    ]);

    const context = sections.join('\n\n');

    if (context) {
      this.logger.log(
        `[DB fallback] tenant=${tenantId} intents=[${[...intents].join(',')}] ` +
        `records=${embeddingJobs.length} chars=${context.length}`,
      );
    }

    return { context, embeddingJobs };
  }
}

/**
 * PrismaDealRepository
 *
 * Implements DealRepositoryPort using Prisma ORM.
 * This is the ONLY file allowed to import PrismaService in the Deals module.
 *
 * Contains all SQL/Prisma logic previously split between:
 *   - DealsRepository (basic CRUD)
 *   - DealsService (kanban, forecast, stage validation, history)
 *
 * Architecture rules enforced here:
 *   1. All Prisma results → DealReadModel conversion goes through toDealReadModel()
 *   2. No `as DealReadModel` casts anywhere — the mapper is the single source of truth
 *   3. All contact selects include `email` so DealReadModel.contact is always complete
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { PrismaTransactionService } from '../../../../core/database/prisma-transaction.service';
import {
  DealRepositoryPort,
  DealReadModel,
  DealCreateData,
  DealUpdateData,
  StageReadModel,
  StageHistoryRecord,
  KanbanBoard,
  ForecastResult,
  PaginatedResult,
} from '../../application/ports/deal.repository.port';
import { FilterDealDto } from '../../deals.dto';
import {
  buildPrismaSkipTake,
  buildPaginatedResult,
} from '../../../../common/dto/pagination.dto';

// ─── Prisma select / include shapes ─────────────────────────────────────────
// These constants define exactly what Prisma fetches.
// The mapper below depends on them — keep them in sync.

/** Contact fields required by DealReadModel.contact */
const CONTACT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,       // required by DealReadModel — must not be omitted
} as const;

/** Owner fields required by DealReadModel.owner */
const OWNER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
} as const;

/** Company fields required by DealReadModel.company */
const COMPANY_SELECT = {
  id: true,
  name: true,
} as const;

/** Standard relation includes reused across list / kanban queries */
const DEAL_INCLUDES = {
  stage:    true,
  pipeline: { select: { id: true, name: true } },
  contact:  { select: CONTACT_SELECT },
  company:  { select: COMPANY_SELECT },
  owner:    { select: OWNER_SELECT },
} as const;

/** Richer includes for single-deal queries (adds stageHistory) */
const DEAL_INCLUDES_FULL = {
  stage:    true,
  pipeline: true,
  contact:  { select: { ...CONTACT_SELECT, phone: true } },
  company:  { select: COMPANY_SELECT },
  owner:    { select: OWNER_SELECT },
  stageHistory: {
    include: { toStage: { select: { name: true, color: true } } },
    orderBy: { movedAt: 'desc' as const },
  },
} as const;

// ─── Prisma result types inferred from include shapes ────────────────────────
// These are the TypeScript types Prisma returns for the above includes.
// By inferring them, we get compile-time guarantees that the mapper receives
// exactly what it expects — no manual type assertions required.

type PrismaDealWithIncludes = Prisma.DealGetPayload<{ include: typeof DEAL_INCLUDES }>;
type PrismaDealWithFullIncludes = Prisma.DealGetPayload<{ include: typeof DEAL_INCLUDES_FULL }>;

// ─── Mapper ──────────────────────────────────────────────────────────────────

/**
 * Convert a Prisma deal row (with standard includes) → DealReadModel.
 *
 * Why a mapper instead of `as DealReadModel`:
 *   - TypeScript would accept incorrect shapes silently with a cast
 *   - The mapper makes field presence explicit and compile-time verified
 *   - If Prisma schema changes, this function fails to compile — not at runtime
 */
function toDealReadModel(
  row: PrismaDealWithIncludes | PrismaDealWithFullIncludes,
): DealReadModel {
  return {
    id:          row.id,
    title:       row.title,
    value:       row.value,
    currency:    row.currency,
    status:      row.status,
    stageId:     row.stageId,
    pipelineId:  row.pipelineId,
    tenantId:    row.tenantId,
    ownerId:     row.ownerId,
    contactId:   row.contactId,
    companyId:   row.companyId,
    closingDate: row.closingDate,
    description: row.description,
    tags:        row.tags,
    wonAt:       row.wonAt,
    lostAt:      row.lostAt,
    lostReason:  row.lostReason,
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,

    // Relations — present when the query includes them
    stage:   row.stage
      ? {
          id:          row.stage.id,
          name:        row.stage.name,
          color:       row.stage.color,
          position:    row.stage.position,
          probability: row.stage.probability,
          pipelineId:  row.stage.pipelineId,
          isWon:       row.stage.isWon,
          isLost:      row.stage.isLost,
        }
      : undefined,

    contact: row.contact
      ? {
          id:        row.contact.id,
          firstName: row.contact.firstName,
          lastName:  row.contact.lastName,
          email:     row.contact.email,          // always present — CONTACT_SELECT requires it
        }
      : null,

    company: row.company
      ? { id: row.company.id, name: row.company.name }
      : null,

    owner: row.owner
      ? {
          id:        row.owner.id,
          firstName: row.owner.firstName,
          lastName:  row.owner.lastName,
          avatarUrl: row.owner.avatarUrl ?? null,
        }
      : null,

    // stageHistory is only present in full-include queries
    stageHistory: 'stageHistory' in row && Array.isArray(row.stageHistory)
      ? row.stageHistory.map((h) => ({
          toStage: { name: h.toStage.name, color: h.toStage.color },
          movedAt: h.movedAt,
        }))
      : undefined,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

@Injectable()
export class PrismaDealRepository implements DealRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: PrismaTransactionService,
  ) {}

  // ─── Commands ──────────────────────────────────────────────────────────────

  async create(data: DealCreateData): Promise<DealReadModel> {
    const { pipelineId, stageId, contactId, companyId, tenantId, ownerId, ...rest } = data;

    const row = await this.prisma.deal.create({
      data: {
        ...rest,
        customFields: rest.customFields as Prisma.InputJsonValue,
        tenant:   { connect: { id: tenantId } },
        pipeline: { connect: { id: pipelineId } },
        stage:    { connect: { id: stageId } },
        ...(ownerId   && { owner:   { connect: { id: ownerId } } }),
        ...(contactId && { contact: { connect: { id: contactId } } }),
        ...(companyId && { company: { connect: { id: companyId } } }),
      },
      include: DEAL_INCLUDES,
    });

    return toDealReadModel(row);
  }

  async update(id: string, data: DealUpdateData): Promise<DealReadModel> {
    const row = await this.prisma.deal.update({
      where: { id },
      data:  data as Prisma.DealUpdateInput,
      include: DEAL_INCLUDES,
    });

    return toDealReadModel(row);
  }

  /**
   * Atomically updates the deal AND records stage history in one transaction.
   * Called exclusively by MoveDealStageUseCase.
   */
  async updateInTransaction(
    id: string,
    data: DealUpdateData,
    historyRecord: StageHistoryRecord,
  ): Promise<DealReadModel> {
    const row = await this.tx.run(async (client) => {
      const updated = await client.deal.update({
        where: { id },
        data:  data as Prisma.DealUpdateInput,
        include: {
          stage:   true,
          contact: { select: CONTACT_SELECT },   // email included — fixes TS2352
          company: { select: COMPANY_SELECT },
          owner:   { select: OWNER_SELECT },
          pipeline: { select: { id: true, name: true } },
        },
      });

      await client.dealStageHistory.create({
        data: {
          dealId:      historyRecord.dealId,
          tenantId:    historyRecord.tenantId,
          fromStageId: historyRecord.fromStageId,
          toStageId:   historyRecord.toStageId,
          movedById:   historyRecord.movedById,
        },
      });

      return updated;
    });

    return toDealReadModel(row as PrismaDealWithIncludes);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.deal.delete({ where: { id } });
  }

  async recordStageHistory(record: StageHistoryRecord): Promise<void> {
    await this.prisma.dealStageHistory.create({
      data: {
        dealId:    record.dealId,
        tenantId:  record.tenantId,
        toStageId: record.toStageId,
        movedById: record.movedById,
        ...(record.fromStageId && { fromStageId: record.fromStageId }),
      },
    });
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  async findById(id: string): Promise<DealReadModel | null> {
    const row = await this.prisma.deal.findFirst({
      where:   { id },
      include: DEAL_INCLUDES_FULL,
    });

    return row ? toDealReadModel(row) : null;
  }

  async findAll(filters: FilterDealDto): Promise<PaginatedResult<DealReadModel>> {
    const {
      page, limit, sortBy, sortOrder, search,
      pipelineId, stageId, status, ownerId, contactId, minValue, maxValue,
    } = filters;

    const where: Prisma.DealWhereInput = {
      ...(pipelineId && { pipelineId }),
      ...(stageId    && { stageId }),
      ...(status     && { status }),
      ...(ownerId    && { ownerId }),
      ...(contactId  && { contactId }),
      ...(minValue !== undefined && { value: { gte: minValue } }),
      ...(maxValue !== undefined && { value: { lte: maxValue } }),
      ...(search && { title: { contains: search, mode: 'insensitive' as const } }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        include:  DEAL_INCLUDES,
        orderBy:  { [sortBy ?? 'createdAt']: sortOrder },
        ...buildPrismaSkipTake(page, limit),
      }),
      this.prisma.deal.count({ where }),
    ]);

    const data = rows.map((r) => toDealReadModel(r as PrismaDealWithIncludes));
    return buildPaginatedResult(data, total, page, limit);
  }

  async findStageInPipeline(
    stageId: string,
    pipelineId: string,
  ): Promise<StageReadModel | null> {
    const row = await this.prisma.stage.findFirst({
      where: { id: stageId, pipelineId },
      select: {
        id:          true,
        name:        true,
        color:       true,
        position:    true,
        probability: true,
        pipelineId:  true,
        isWon:       true,
        isLost:      true,
      },
    });

    if (!row) return null;

    return {
      id:          row.id,
      name:        row.name,
      color:       row.color,
      position:    row.position,
      probability: row.probability,
      pipelineId:  row.pipelineId,
      isWon:       row.isWon,
      isLost:      row.isLost,
    };
  }

  async getKanbanBoard(pipelineId: string): Promise<KanbanBoard> {
    const stages = await this.prisma.stage.findMany({
      where:   { pipelineId },
      orderBy: { position: 'asc' },
      select: {
        id:          true,
        name:        true,
        color:       true,
        position:    true,
        probability: true,
        pipelineId:  true,
        isWon:       true,
        isLost:      true,
      },
    });

    const rows = await this.prisma.deal.findMany({
      where:   { pipelineId, status: 'OPEN' },
      include: {
        contact: { select: CONTACT_SELECT },
        company: { select: COMPANY_SELECT },
        owner:   { select: OWNER_SELECT },
        stage:   true,
        pipeline: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const deals = rows.map((r) => toDealReadModel(r as PrismaDealWithIncludes));

    const kanbanStages = stages.map((stage) => {
      const stageDeals = deals.filter((d) => d.stageId === stage.id);
      return {
        stage,
        deals:      stageDeals,
        count:      stageDeals.length,
        totalValue: stageDeals.reduce((sum, d) => sum + Number(d.value), 0),
      };
    });

    return { pipelineId, stages: kanbanStages };
  }

  async getForecast(pipelineId: string): Promise<ForecastResult> {
    const stages = await this.prisma.stage.findMany({
      where:   { pipelineId },
      orderBy: { position: 'asc' },
    });

    const aggregates = await Promise.all(
      stages.map((s) =>
        this.prisma.deal.aggregate({
          where:  { stageId: s.id, status: 'OPEN' },
          _count: { id: true },
          _sum:   { value: true },
        }),
      ),
    );

    let totalForecast = 0;
    let totalPipeline = 0;

    const breakdown = stages.map((stage, i) => {
      const agg           = aggregates[i];
      const stageTotal    = Number(agg._sum.value ?? 0);
      const dealCount     = agg._count.id;
      const stageForecast = stageTotal * stage.probability;
      totalForecast += stageForecast;
      totalPipeline += stageTotal;

      return {
        stage:           stage.name,
        probability:     stage.probability,
        totalValue:      stageTotal,
        forecastedValue: stageForecast,
        dealCount,
      };
    });

    return { totalPipeline, totalForecast, breakdown };
  }
}

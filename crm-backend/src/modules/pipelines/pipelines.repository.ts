/**
 * Pipelines Repository
 *
 * Note: tenantId is NOT passed to Prisma here — it is injected automatically
 * by the PrismaService middleware from AsyncLocalStorage.
 * All queries are automatically tenant-scoped.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma } from '@prisma/client';
import { FilterPipelineDto } from './pipelines.dto';

@Injectable()
export class PipelinesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FilterPipelineDto) {
    const { sortBy, sortOrder, search, isDefault } = filters;

    const where: Prisma.PipelineWhereInput = {
      ...(isDefault !== undefined && { isDefault }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };

    return this.prisma.pipeline.findMany({
      where,
      include: {
        stages: { orderBy: { position: 'asc' } },
      },
      orderBy: { [sortBy ?? 'createdAt']: sortOrder },
    });
  }

  async findById(id: string) {
    return this.prisma.pipeline.findFirst({
      where: { id },
      include: {
        stages: {
          orderBy: { position: 'asc' },
          include: {
            _count: { select: { deals: true } },
          },
        },
      },
    });
  }

  async findDefault() {
    return this.prisma.pipeline.findFirst({
      where: { isDefault: true },
      include: {
        stages: { orderBy: { position: 'asc' } },
      },
    });
  }

  async create(data: Prisma.PipelineCreateInput) {
    return this.prisma.pipeline.create({ data });
  }

  async update(id: string, data: Prisma.PipelineUpdateInput) {
    return this.prisma.pipeline.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.pipeline.delete({ where: { id } });
  }

  // ── Stage methods ───────────────────────────────────────────────────────────

  async findStageById(id: string) {
    return this.prisma.stage.findFirst({ where: { id } });
  }

  async createStage(data: Prisma.StageCreateInput) {
    return this.prisma.stage.create({ data });
  }

  async updateStage(id: string, data: Prisma.StageUpdateInput) {
    return this.prisma.stage.update({ where: { id }, data });
  }

  async deleteStage(id: string) {
    return this.prisma.stage.delete({ where: { id } });
  }

  async findStagesByPipelineId(pipelineId: string) {
    return this.prisma.stage.findMany({
      where: { pipelineId },
      orderBy: { position: 'asc' },
    });
  }
}

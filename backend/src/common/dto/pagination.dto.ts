import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Pagination defaults come from env (`DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`) but
 * the DTO must be self-contained so `class-validator` can enforce hard limits
 * before a handler ever runs.
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class PaginationDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  /** Prisma `skip`. */
  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }

  /** Prisma `take`. */
  get take(): number {
    return this.pageSize;
  }
}

/** The envelope every list endpoint returns. Stable — the frontend depends on it. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function paginated<T>(items: T[], pagination: PaginationDto, total: number): Paginated<T> {
  const totalPages = pagination.pageSize > 0 ? Math.ceil(total / pagination.pageSize) : 0;
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages,
    hasNext: pagination.page < totalPages,
    hasPrev: pagination.page > 1,
  };
}

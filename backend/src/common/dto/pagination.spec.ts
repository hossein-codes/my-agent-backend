import { PaginationDto, paginated, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './pagination.dto';

describe('PaginationDto', () => {
  const make = (page: number, pageSize: number) => Object.assign(new PaginationDto(), { page, pageSize });

  it('defaults to page 1 and the configured page size', () => {
    const dto = new PaginationDto();
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('computes the Prisma skip/take pair', () => {
    expect(make(1, 20)).toMatchObject({ skip: 0, take: 20 });
    expect(make(3, 25)).toMatchObject({ skip: 50, take: 25 });
  });

  it('exposes a page-size ceiling', () => {
    expect(MAX_PAGE_SIZE).toBe(100);
  });
});

describe('paginated()', () => {
  const dto = (page: number, pageSize: number) => Object.assign(new PaginationDto(), { page, pageSize });

  it('returns the envelope the frontend depends on', () => {
    const result = paginated([{ id: 1 }, { id: 2 }], dto(1, 2), 5);
    expect(result).toEqual({
      items: [{ id: 1 }, { id: 2 }],
      total: 5,
      page: 1,
      pageSize: 2,
      totalPages: 3,
      hasNext: true,
      hasPrev: false,
    });
  });

  it('flags the last page correctly', () => {
    const result = paginated([], dto(3, 2), 5);
    expect(result).toMatchObject({ totalPages: 3, hasNext: false, hasPrev: true });
  });

  it('reports zero pages for an empty result without dividing by zero', () => {
    const result = paginated([], dto(1, 20), 0);
    expect(result).toMatchObject({ total: 0, totalPages: 0, hasNext: false, hasPrev: false });
  });

  it('rounds the page count up so a partial last page is reachable', () => {
    expect(paginated([], dto(1, 20), 21).totalPages).toBe(2);
    expect(paginated([], dto(1, 20), 20).totalPages).toBe(1);
  });
});

import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryProjectsDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  // Whitelist: the sort column can never come straight from user input
  @IsOptional()
  @IsIn(['createdAt', 'budget'])
  sortBy: 'createdAt' | 'budget' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';

  /** Public listing defaults to OPEN projects only (those are the ones that can receive bids). */
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'COMPLETED'])
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' = 'OPEN';
}

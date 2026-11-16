import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeliverDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

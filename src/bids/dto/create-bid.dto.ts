import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsPositive, IsString, Max, MaxLength } from 'class-validator';

export class CreateBidDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000_000)
  price: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(3650)
  deliveryDays: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message: string;
}

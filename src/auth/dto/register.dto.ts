import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  // bcrypt only reads the first 72 bytes, so cap the length
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  /** ADMIN is rejected here on purpose: admin accounts are created by prisma/seed.ts only. */
  @IsIn(['CLIENT', 'FREELANCER'])
  role: 'CLIENT' | 'FREELANCER';
}

import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Trims before validation runs (ValidationPipe's `transform: true` applies
// @Transform via plainToInstance first) so a whitespace-only value like
// "   " correctly fails @IsNotEmpty() instead of slipping through — the
// frontend already trims, but the API shouldn't rely on that alone.
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePostDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;
}

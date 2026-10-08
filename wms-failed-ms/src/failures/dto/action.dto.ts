import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReassignDto {
  @ApiProperty()
  @IsString()
  warehouseId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  actor?: string;
}

export class ActorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  actor?: string;
}

export class NoteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  note!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  actor?: string;
}

export class AckDto {
  @ApiProperty()
  @IsIn(['success', 'failure'])
  result!: 'success' | 'failure';

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['retried', 'reassigned', 'skipped', 'auto_retried'])
  resolution?: 'retried' | 'reassigned' | 'skipped' | 'auto_retried';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  actor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  auto?: boolean;
}

export class BulkActionDto {
  @ApiProperty({ enum: ['retry', 'skip'] })
  @IsIn(['retry', 'skip'])
  action!: 'retry' | 'skip';

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  actor?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateEntryDto } from './create-entry.dto.js';

export class BulkCreateDto {
  @ApiProperty({ type: [CreateEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateEntryDto)
  entries!: CreateEntryDto[];
}

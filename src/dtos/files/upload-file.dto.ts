import { Transform } from "class-transformer";
import { IsOptional, IsBoolean, IsString, MaxLength } from "class-validator";

export class UploadFileDto {
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  keep_original_name?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  path?: string;
}

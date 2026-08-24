import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OtpRequestDto {
  @ApiProperty({ example: '+989121234567', description: 'E.164 Iranian mobile number' })
  @Matches(/^\+989\d{9}$/, { message: 'phone must be an Iranian mobile number in E.164 (+989xxxxxxxxx)' })
  phone!: string;
}

export class OtpVerifyDto {
  @ApiProperty({ example: '+989121234567' })
  @Matches(/^\+989\d{9}$/)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString() @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;

  @ApiProperty({ enum: ['WEB', 'ANDROID', 'IOS'], required: false })
  @IsOptional() @IsIn(['WEB', 'ANDROID', 'IOS'])
  deviceKind?: 'WEB' | 'ANDROID' | 'IOS';

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MaxLength(120)
  deviceName?: string;
}

export class RefreshDto {
  @ApiProperty({ required: false, description: 'Mobile clients only; web uses the HttpOnly cookie' })
  @IsOptional() @IsString() @Length(32, 256)
  refreshToken?: string;
}

export class RecoveryRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsString() @Matches(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
  email!: string;
}

export class RecoveryConfirmDto {
  @ApiProperty()
  @IsString() @Length(20, 256)
  token!: string;

  @ApiProperty({ example: '+989121234567' })
  @Matches(/^\+989\d{9}$/)
  newPhone!: string;
}

export class DeviceKindDto {
  @ApiProperty({ enum: ['WEB', 'ANDROID', 'IOS'] })
  @IsIn(['WEB', 'ANDROID', 'IOS'])
  deviceKind!: 'WEB' | 'ANDROID' | 'IOS';

  @IsOptional() @IsString() @MaxLength(120)
  deviceName?: string;
}

import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public, Permissions, CurrentUser, type AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { FeaturesService } from './features.service';
import { SettingsService, type SettingValueType } from './settings.service';

class FlagDto {
  @IsBoolean() isEnabled!: boolean;
}
class SettingDto {
  @IsString() @MaxLength(4000) value!: string;
  @IsOptional() @IsIn(['string', 'integer', 'boolean', 'json']) valueType?: SettingValueType;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

/**
 * Public settings the storefront reads on boot (store name, support phone…).
 * Returns ONLY rows flagged `isPublic` — see SettingsService.listPublic.
 */
@ApiTags('system')
@Controller('system')
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('settings')
  @Public()
  async publicSettings(): Promise<Record<string, string>> {
    return this.settings.listPublic();
  }
}

@ApiBearerAuth('access-token')
@ApiTags('admin.system')
@Controller('admin/system')
export class AdminSystemController {
  constructor(
    private readonly features: FeaturesService,
    private readonly settings: SettingsService,
  ) {}

  @Get('flags')
  @Permissions('settings.manage')
  listFlags() {
    return this.features.list();
  }

  @Patch('flags/:key')
  @Permissions('settings.manage')
  async setFlag(@Param('key') key: string, @Body() dto: FlagDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.features.set(key, dto.isEnabled, actor.userId);
  }

  @Patch('settings/:key')
  @Permissions('settings.manage')
  async setSetting(
    @Param('key') key: string,
    @Body() dto: SettingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.settings.set(key, dto.value, dto.valueType ?? 'string', {
      isPublic: dto.isPublic,
      updatedById: actor.userId,
    });
    return { updated: true, key };
  }
}

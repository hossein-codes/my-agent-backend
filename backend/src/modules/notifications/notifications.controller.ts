import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { NotificationService } from './notification.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';

class PreferencesDto {
  @IsOptional() @IsBoolean() smsEnabled?: boolean;
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsBoolean() inAppEnabled?: boolean;
  @IsOptional() @IsBoolean() promotionalEnabled?: boolean;
}

@ApiBearerAuth('access-token')
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationDto, @Query('unread') unread?: string) {
    const { items, total } = await this.notifications.listForUser(user.userId, pagination.page, pagination.pageSize, unread === 'true');
    return paginated(items, pagination, total);
  }

  @Post(':id/read')
  async read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.notifications.markRead(user.userId, id);
    return { read: true };
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: AuthenticatedUser) {
    await this.notifications.markAllRead(user.userId);
    return { read: true };
  }

  @Get('preferences')
  async preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.getPreferences(user.userId);
  }

  @Post('preferences')
  async updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreferencesDto) {
    return this.notifications.updatePreferences(user.userId, dto);
  }
}

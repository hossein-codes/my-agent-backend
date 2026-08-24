import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController, AdminSessionController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { RecoveryService } from './recovery.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, AdminSessionController],
  providers: [AuthService, OtpService, SessionService, RecoveryService],
  exports: [OtpService, SessionService],
})
export class AuthModule {}

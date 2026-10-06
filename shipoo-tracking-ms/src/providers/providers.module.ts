import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantProviderCredential } from '../database/entities/tenant-provider-credential.entity.js';
import { TRACKING_PROVIDER } from './tracking/tracking-provider.interface.js';
import { ShippoCredentialResolver } from './shippo/shippo-credential.resolver.js';
import { ShippoHttpClient } from './shippo/shippo-http.client.js';
import { ShippoTrackingProvider } from './shippo/shippo-tracking.provider.js';

@Module({
  imports: [TypeOrmModule.forFeature([TenantProviderCredential])],
  providers: [
    ShippoCredentialResolver,
    ShippoHttpClient,
    ShippoTrackingProvider,
    {
      provide: TRACKING_PROVIDER,
      useExisting: ShippoTrackingProvider,
    },
  ],
  exports: [TRACKING_PROVIDER, ShippoHttpClient, ShippoTrackingProvider],
})
export class ProvidersModule {}

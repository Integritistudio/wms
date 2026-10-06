import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private inboundAccepted = 0;
  private inboundDuplicates = 0;
  private outboundSuccess = 0;
  private outboundFailed = 0;
  private providerErrors = 0;

  incInboundAccepted(): void {
    this.inboundAccepted += 1;
  }

  incInboundDuplicate(): void {
    this.inboundDuplicates += 1;
  }

  incOutboundSuccess(): void {
    this.outboundSuccess += 1;
  }

  incOutboundFailed(): void {
    this.outboundFailed += 1;
  }

  incProviderError(): void {
    this.providerErrors += 1;
  }

  snapshot() {
    return {
      inboundAccepted: this.inboundAccepted,
      inboundDuplicates: this.inboundDuplicates,
      outboundSuccess: this.outboundSuccess,
      outboundFailed: this.outboundFailed,
      providerErrors: this.providerErrors,
    };
  }
}

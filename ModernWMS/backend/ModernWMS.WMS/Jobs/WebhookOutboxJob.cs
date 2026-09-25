using Microsoft.Extensions.DependencyInjection;
using ModernWMS.Core.Job;
using ModernWMS.WMS.IServices;

namespace ModernWMS.WMS.Jobs
{
    /// <summary>
    /// Deliver coalesced inventory webhooks from the outbox.
    /// Uses IServiceScopeFactory so Hangfire's captured instance stays safe.
    /// </summary>
    public class WebhookOutboxJob : IJob
    {
        private readonly IServiceScopeFactory _scopeFactory;

        public WebhookOutboxJob(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
        }

        /// <summary>
        /// Every minute
        /// </summary>
        public string CronExpression => "*/1 * * * *";

        public async Task Execute()
        {
            using var scope = _scopeFactory.CreateScope();
            var delivery = scope.ServiceProvider.GetRequiredService<IInventoryWebhookDeliveryService>();
            await delivery.ProcessPendingAsync();
        }
    }
}

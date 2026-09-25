using ModernWMS.Core.DI;

namespace ModernWMS.WMS.IServices
{
    /// <summary>
    /// Coalesce pending outbox rows and deliver HMAC-signed webhooks.
    /// </summary>
    public interface IInventoryWebhookDeliveryService : IDependency
    {
        Task ProcessPendingAsync();
    }
}

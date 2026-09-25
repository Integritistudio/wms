using ModernWMS.Core.DI;

namespace ModernWMS.WMS.IServices
{
    /// <summary>
    /// Enqueue inventory quantity-change notifications (non-blocking vs stock commits).
    /// </summary>
    public interface IInventoryWebhookOutbox : IDependency
    {
        Task EnqueueAsync(
            long tenantId,
            int skuId,
            string skuCode,
            string reason,
            string sourceDoc = "");

        Task EnqueueManyAsync(
            long tenantId,
            IEnumerable<(int skuId, string skuCode)> skus,
            string reason,
            string sourceDoc = "");
    }
}

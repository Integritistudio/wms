using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ModernWMS.Core.DBContext;
using ModernWMS.WMS.Entities.Models;
using ModernWMS.WMS.IServices;

namespace ModernWMS.WMS.Services
{
    /// <summary>
    /// Writes inventory change markers to webhook_outbox after stock commits.
    /// </summary>
    public class InventoryWebhookOutboxService : IInventoryWebhookOutbox
    {
        private readonly SqlDBContext _dBContext;
        private readonly ILogger<InventoryWebhookOutboxService> _logger;

        public InventoryWebhookOutboxService(
            SqlDBContext dBContext,
            ILogger<InventoryWebhookOutboxService> logger)
        {
            _dBContext = dBContext;
            _logger = logger;
        }

        public Task EnqueueAsync(
            long tenantId,
            int skuId,
            string skuCode,
            string reason,
            string sourceDoc = "")
        {
            return EnqueueManyAsync(
                tenantId,
                new[] { (skuId, skuCode ?? "") },
                reason,
                sourceDoc);
        }

        public async Task EnqueueManyAsync(
            long tenantId,
            IEnumerable<(int skuId, string skuCode)> skus,
            string reason,
            string sourceDoc = "")
        {
            try
            {
                var list = skus?
                    .Where(s => s.skuId > 0)
                    .GroupBy(s => s.skuId)
                    .Select(g => g.First())
                    .ToList();
                if (list == null || list.Count == 0)
                {
                    return;
                }

                var missingCodes = list.Where(s => string.IsNullOrWhiteSpace(s.skuCode)).Select(s => s.skuId).ToList();
                Dictionary<int, string> codeMap = new();
                if (missingCodes.Count > 0)
                {
                    codeMap = await _dBContext.GetDbSet<SkuEntity>()
                        .AsNoTracking()
                        .Where(s => missingCodes.Contains(s.id))
                        .ToDictionaryAsync(s => s.id, s => s.sku_code ?? "");
                }

                var now = DateTime.Now;
                var DbSet = _dBContext.GetDbSet<WebhookOutboxEntity>();
                foreach (var (skuId, skuCode) in list)
                {
                    var code = !string.IsNullOrWhiteSpace(skuCode)
                        ? skuCode
                        : (codeMap.TryGetValue(skuId, out var c) ? c : "");
                    DbSet.Add(new WebhookOutboxEntity
                    {
                        id = 0,
                        tenant_id = tenantId,
                        sku_id = skuId,
                        sku_code = code,
                        reason = reason ?? "",
                        source_doc = sourceDoc ?? "",
                        status = "pending",
                        attempts = 0,
                        last_error = "",
                        next_attempt_at = now,
                        create_time = now,
                        last_update_time = now,
                    });
                }
                await _dBContext.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to enqueue inventory webhook outbox for tenant {TenantId} reason {Reason}",
                    tenantId, reason);
            }
        }
    }
}

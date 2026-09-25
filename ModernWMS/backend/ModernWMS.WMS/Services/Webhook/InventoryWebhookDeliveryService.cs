using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ModernWMS.Core.DBContext;
using ModernWMS.WMS.Entities.Models;
using ModernWMS.WMS.IServices;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace ModernWMS.WMS.Services
{
    /// <summary>
    /// Coalesce pending outbox rows and POST absolute inventory snapshots to subscribers.
    /// </summary>
    public class InventoryWebhookDeliveryService : IInventoryWebhookDeliveryService
    {
        private const int MaxAttempts = 8;
        private const string EventName = "inventory.quantity_changed";

        private readonly SqlDBContext _dBContext;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<InventoryWebhookDeliveryService> _logger;

        private static readonly JsonSerializerSettings JsonSettings = new()
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Ignore,
        };

        public InventoryWebhookDeliveryService(
            SqlDBContext dBContext,
            IHttpClientFactory httpClientFactory,
            ILogger<InventoryWebhookDeliveryService> logger)
        {
            _dBContext = dBContext;
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        public async Task ProcessPendingAsync()
        {
            var now = DateTime.Now;
            var outbox = _dBContext.GetDbSet<WebhookOutboxEntity>();

            var pending = await outbox
                .Where(t =>
                    (t.status == "pending" || t.status == "failed")
                    && (t.next_attempt_at == null || t.next_attempt_at <= now)
                    && t.attempts < MaxAttempts)
                .OrderBy(t => t.create_time)
                .Take(200)
                .ToListAsync();

            if (pending.Count == 0)
            {
                return;
            }

            var groups = pending
                .GroupBy(t => new { t.tenant_id, t.sku_id })
                .ToList();

            var subsByTenant = await _dBContext.GetDbSet<WebhookSubscriptionEntity>()
                .AsNoTracking()
                .Where(s => s.enabled)
                .ToListAsync();

            foreach (var group in groups)
            {
                var rows = group.ToList();
                var tenantId = group.Key.tenant_id;
                var skuId = group.Key.sku_id;
                var skuCode = rows.Select(r => r.sku_code).FirstOrDefault(c => !string.IsNullOrWhiteSpace(c)) ?? "";
                var reason = rows.OrderByDescending(r => r.create_time).First().reason;
                var sourceDoc = rows.OrderByDescending(r => r.create_time).First().source_doc;

                if (string.IsNullOrWhiteSpace(skuCode))
                {
                    var sku = await _dBContext.GetDbSet<SkuEntity>()
                        .AsNoTracking()
                        .FirstOrDefaultAsync(s => s.id == skuId);
                    skuCode = sku?.sku_code ?? "";
                }

                var (qty, qtyAvailable) = await ComputeSkuQtyAsync(tenantId, skuId);
                var occurredAt = DateTime.UtcNow;
                var idempotencyKey = $"{tenantId}:{skuId}:{rows.Max(r => r.id)}";

                var payloadObj = new
                {
                    @event = EventName,
                    tenant_id = tenantId,
                    sku_id = skuId,
                    sku_code = skuCode,
                    qty,
                    qty_available = qtyAvailable,
                    reason,
                    source_doc = sourceDoc,
                    occurred_at = occurredAt.ToString("o"),
                    idempotency_key = idempotencyKey,
                };
                var body = JsonConvert.SerializeObject(payloadObj, JsonSettings);

                var subs = subsByTenant
                    .Where(s => s.tenant_id == tenantId
                        && (string.IsNullOrWhiteSpace(s.events) || s.events.Contains(EventName)))
                    .ToList();

                if (subs.Count == 0)
                {
                    foreach (var row in rows)
                    {
                        row.status = "delivered";
                        row.last_error = "no subscribers";
                        row.last_update_time = DateTime.Now;
                    }
                    await _dBContext.SaveChangesAsync();
                    continue;
                }

                var allOk = true;
                var errors = new List<string>();
                var deliveryId = Guid.NewGuid().ToString("N");

                foreach (var sub in subs)
                {
                    try
                    {
                        await DeliverAsync(sub, body, deliveryId);
                    }
                    catch (Exception ex)
                    {
                        allOk = false;
                        errors.Add($"{sub.callback_url}: {ex.Message}");
                        _logger.LogWarning(ex,
                            "Webhook delivery failed tenant={TenantId} sku={SkuId} url={Url}",
                            tenantId, skuId, sub.callback_url);
                    }
                }

                foreach (var row in rows)
                {
                    row.attempts += 1;
                    row.last_update_time = DateTime.Now;
                    if (allOk)
                    {
                        row.status = "delivered";
                        row.last_error = "";
                        row.next_attempt_at = null;
                    }
                    else
                    {
                        row.last_error = string.Join("; ", errors);
                        if (row.attempts >= MaxAttempts)
                        {
                            row.status = "dead";
                            row.next_attempt_at = null;
                        }
                        else
                        {
                            row.status = "failed";
                            var delaySec = Math.Min(3600, (int)Math.Pow(2, row.attempts) * 5);
                            row.next_attempt_at = DateTime.Now.AddSeconds(delaySec);
                        }
                    }
                }

                await _dBContext.SaveChangesAsync();
            }
        }

        private async Task<(int qty, int qtyAvailable)> ComputeSkuQtyAsync(long tenantId, int skuId)
        {
            var stocks = await _dBContext.GetDbSet<StockEntity>()
                .AsNoTracking()
                .Where(s => s.tenant_id == tenantId && s.sku_id == skuId)
                .ToListAsync();

            var qty = stocks.Sum(s => s.qty);
            var frozen = stocks.Where(s => s.is_freeze).Sum(s => s.qty);

            var dispatchLocked = await _dBContext.GetDbSet<DispatchlistEntity>()
                .AsNoTracking()
                .Where(d => d.sku_id == skuId && d.tenant_id == tenantId && d.lock_qty > 0)
                .SumAsync(d => (int?)d.lock_qty) ?? 0;

            var processLocked = await _dBContext.GetDbSet<StockprocessdetailEntity>()
                .AsNoTracking()
                .Where(p => p.sku_id == skuId && p.tenant_id == tenantId && p.is_update_stock == false && p.is_source == true)
                .SumAsync(p => (int?)p.qty) ?? 0;

            var moveLocked = await _dBContext.GetDbSet<StockmoveEntity>()
                .AsNoTracking()
                .Where(m => m.sku_id == skuId && m.move_status == 0 && m.tenant_id == tenantId)
                .SumAsync(m => (int?)m.qty) ?? 0;

            var available = Math.Max(0, qty - frozen - dispatchLocked - processLocked - moveLocked);
            return (qty, available);
        }

        private async Task DeliverAsync(WebhookSubscriptionEntity sub, string body, string deliveryId)
        {
            var signature = Sign(body, sub.secret);
            var client = _httpClientFactory.CreateClient();
            using var request = new HttpRequestMessage(HttpMethod.Post, sub.callback_url);
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
            request.Headers.TryAddWithoutValidation("X-WMS-Signature", signature);
            request.Headers.TryAddWithoutValidation("X-WMS-Event", EventName);
            request.Headers.TryAddWithoutValidation("X-WMS-Delivery-Id", deliveryId);
            client.Timeout = TimeSpan.FromSeconds(15);

            using var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                var text = await response.Content.ReadAsStringAsync();
                throw new InvalidOperationException($"HTTP {(int)response.StatusCode}: {text}");
            }
        }

        internal static string Sign(string body, string secret)
        {
            var key = Encoding.UTF8.GetBytes(secret ?? "");
            var data = Encoding.UTF8.GetBytes(body ?? "");
            using var hmac = new HMACSHA256(key);
            return Convert.ToBase64String(hmac.ComputeHash(data));
        }
    }
}

using ModernWMS.Core.Models;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModernWMS.WMS.Entities.Models
{
    /// <summary>
    /// Inventory change outbox — coalesced and delivered by background job.
    /// </summary>
    [Table("webhook_outbox")]
    public class WebhookOutboxEntity : BaseModel
    {
        public long tenant_id { get; set; } = 1;

        public int sku_id { get; set; } = 0;

        public string sku_code { get; set; } = string.Empty;

        public string reason { get; set; } = string.Empty;

        public string source_doc { get; set; } = string.Empty;

        /// <summary>
        /// pending | processing | delivered | failed | dead
        /// </summary>
        public string status { get; set; } = "pending";

        public int attempts { get; set; } = 0;

        public string last_error { get; set; } = string.Empty;

        public DateTime? next_attempt_at { get; set; }

        public DateTime create_time { get; set; } = DateTime.Now;

        public DateTime last_update_time { get; set; } = DateTime.Now;
    }
}

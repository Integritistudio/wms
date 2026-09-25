using ModernWMS.Core.Models;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModernWMS.WMS.Entities.Models
{
    /// <summary>
    /// Outbound webhook subscription (per tenant + callback URL).
    /// </summary>
    [Table("webhook_subscription")]
    public class WebhookSubscriptionEntity : BaseModel
    {
        public long tenant_id { get; set; } = 1;

        public string callback_url { get; set; } = string.Empty;

        public string secret { get; set; } = string.Empty;

        /// <summary>
        /// Comma-separated event names, e.g. inventory.quantity_changed
        /// </summary>
        public string events { get; set; } = "inventory.quantity_changed";

        public bool enabled { get; set; } = true;

        public DateTime create_time { get; set; } = DateTime.Now;

        public DateTime last_update_time { get; set; } = DateTime.Now;
    }
}

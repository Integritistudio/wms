using System.ComponentModel.DataAnnotations;

namespace ModernWMS.WMS.Entities.ViewModels
{
    /// <summary>
    /// Webhook subscription view model
    /// </summary>
    public class WebhookSubscriptionViewModel
    {
        public int id { get; set; } = 0;

        [Required(ErrorMessage = "Required")]
        [MaxLength(512, ErrorMessage = "MaxLength")]
        public string callback_url { get; set; } = string.Empty;

        /// <summary>
        /// Optional; generated server-side when empty on create.
        /// </summary>
        [MaxLength(128, ErrorMessage = "MaxLength")]
        public string secret { get; set; } = string.Empty;

        [MaxLength(256, ErrorMessage = "MaxLength")]
        public string events { get; set; } = "inventory.quantity_changed";

        public bool enabled { get; set; } = true;

        public DateTime create_time { get; set; } = DateTime.Now;

        public DateTime last_update_time { get; set; } = DateTime.Now;
    }
}

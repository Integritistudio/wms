using ModernWMS.Core.JWT;
using ModernWMS.Core.Services;
using ModernWMS.WMS.Entities.Models;
using ModernWMS.WMS.Entities.ViewModels;

namespace ModernWMS.WMS.IServices
{
    /// <summary>
    /// Webhook subscription CRUD (tenant-scoped)
    /// </summary>
    public interface IWebhookSubscriptionService : IBaseService<WebhookSubscriptionEntity>
    {
        Task<List<WebhookSubscriptionViewModel>> GetAllAsync(CurrentUser currentUser);

        Task<WebhookSubscriptionViewModel> GetAsync(int id, CurrentUser currentUser);

        /// <summary>
        /// Create or upsert by callback_url for the current tenant.
        /// </summary>
        Task<(int id, string msg, WebhookSubscriptionViewModel data)> UpsertAsync(
            WebhookSubscriptionViewModel viewModel,
            CurrentUser currentUser);

        Task<(bool flag, string msg)> DeleteAsync(int id, CurrentUser currentUser);
    }
}

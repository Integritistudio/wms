using Mapster;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;
using ModernWMS.Core.DBContext;
using ModernWMS.Core.JWT;
using ModernWMS.Core.Services;
using ModernWMS.WMS.Entities.Models;
using ModernWMS.WMS.Entities.ViewModels;
using ModernWMS.WMS.IServices;
using System.Security.Cryptography;

namespace ModernWMS.WMS.Services
{
    /// <summary>
    /// Webhook subscription service
    /// </summary>
    public class WebhookSubscriptionService : BaseService<WebhookSubscriptionEntity>, IWebhookSubscriptionService
    {
        private readonly SqlDBContext _dBContext;
        private readonly IStringLocalizer<Core.MultiLanguage> _stringLocalizer;

        public WebhookSubscriptionService(
            SqlDBContext dBContext,
            IStringLocalizer<Core.MultiLanguage> stringLocalizer)
        {
            _dBContext = dBContext;
            _stringLocalizer = stringLocalizer;
        }

        public async Task<List<WebhookSubscriptionViewModel>> GetAllAsync(CurrentUser currentUser)
        {
            var rows = await _dBContext.GetDbSet<WebhookSubscriptionEntity>()
                .AsNoTracking()
                .Where(t => t.tenant_id == currentUser.tenant_id)
                .OrderByDescending(t => t.create_time)
                .ToListAsync();
            return rows.Adapt<List<WebhookSubscriptionViewModel>>();
        }

        public async Task<WebhookSubscriptionViewModel> GetAsync(int id, CurrentUser currentUser)
        {
            var entity = await _dBContext.GetDbSet<WebhookSubscriptionEntity>()
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.id == id && t.tenant_id == currentUser.tenant_id);
            return entity == null ? new WebhookSubscriptionViewModel() : entity.Adapt<WebhookSubscriptionViewModel>();
        }

        public async Task<(int id, string msg, WebhookSubscriptionViewModel data)> UpsertAsync(
            WebhookSubscriptionViewModel viewModel,
            CurrentUser currentUser)
        {
            var callback = (viewModel.callback_url || "").Trim();
            if (string.IsNullOrWhiteSpace(callback) || !Uri.TryCreate(callback, UriKind.Absolute, out var uri)
                || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                return (0, "callback_url must be an absolute http(s) URL", new WebhookSubscriptionViewModel());
            }

            var events = string.IsNullOrWhiteSpace(viewModel.events)
                ? "inventory.quantity_changed"
                : viewModel.events.Trim();

            var DbSet = _dBContext.GetDbSet<WebhookSubscriptionEntity>();
            var existing = await DbSet.FirstOrDefaultAsync(t =>
                t.tenant_id == currentUser.tenant_id && t.callback_url == callback);

            if (existing != null)
            {
                existing.events = events;
                existing.enabled = viewModel.enabled;
                if (!string.IsNullOrWhiteSpace(viewModel.secret))
                {
                    existing.secret = viewModel.secret.Trim();
                }
                existing.last_update_time = DateTime.Now;
                await _dBContext.SaveChangesAsync();
                return (existing.id, _stringLocalizer["save_success"], existing.Adapt<WebhookSubscriptionViewModel>());
            }

            var secret = string.IsNullOrWhiteSpace(viewModel.secret)
                ? GenerateSecret()
                : viewModel.secret.Trim();

            var entity = new WebhookSubscriptionEntity
            {
                id = 0,
                tenant_id = currentUser.tenant_id,
                callback_url = callback,
                secret = secret,
                events = events,
                enabled = viewModel.enabled,
                create_time = DateTime.Now,
                last_update_time = DateTime.Now,
            };
            DbSet.Add(entity);
            await _dBContext.SaveChangesAsync();
            if (entity.id <= 0)
            {
                return (0, _stringLocalizer["save_failed"], new WebhookSubscriptionViewModel());
            }
            return (entity.id, _stringLocalizer["save_success"], entity.Adapt<WebhookSubscriptionViewModel>());
        }

        public async Task<(bool flag, string msg)> DeleteAsync(int id, CurrentUser currentUser)
        {
            var qty = await _dBContext.GetDbSet<WebhookSubscriptionEntity>()
                .Where(t => t.id == id && t.tenant_id == currentUser.tenant_id)
                .ExecuteDeleteAsync();
            return qty > 0
                ? (true, _stringLocalizer["delete_success"])
                : (false, _stringLocalizer["delete_failed"]);
        }

        private static string GenerateSecret()
        {
            var bytes = RandomNumberGenerator.GetBytes(32);
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }
    }
}

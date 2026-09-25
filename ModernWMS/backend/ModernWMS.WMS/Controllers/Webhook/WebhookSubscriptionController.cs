using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Localization;
using ModernWMS.Core.Controller;
using ModernWMS.Core.Models;
using ModernWMS.WMS.Entities.ViewModels;
using ModernWMS.WMS.IServices;

namespace ModernWMS.WMS.Controllers
{
    /// <summary>
    /// Webhook subscription controller (tenant-scoped)
    /// </summary>
    [Route("webhook-subscription")]
    [ApiController]
    [ApiExplorerSettings(GroupName = "Base")]
    public class WebhookSubscriptionController : BaseController
    {
        private readonly IWebhookSubscriptionService _service;
        private readonly IStringLocalizer<ModernWMS.Core.MultiLanguage> _stringLocalizer;

        public WebhookSubscriptionController(
            IWebhookSubscriptionService service,
            IStringLocalizer<ModernWMS.Core.MultiLanguage> stringLocalizer)
        {
            _service = service;
            _stringLocalizer = stringLocalizer;
        }

        /// <summary>
        /// List subscriptions for current tenant
        /// </summary>
        [HttpGet]
        public async Task<ResultModel<List<WebhookSubscriptionViewModel>>> GetAllAsync()
        {
            var data = await _service.GetAllAsync(CurrentUser);
            return ResultModel<List<WebhookSubscriptionViewModel>>.Success(data ?? new List<WebhookSubscriptionViewModel>());
        }

        /// <summary>
        /// Get one subscription
        /// </summary>
        [HttpGet("{id:int}")]
        public async Task<ResultModel<WebhookSubscriptionViewModel>> GetAsync(int id)
        {
            var data = await _service.GetAsync(id, CurrentUser);
            if (data != null && data.id > 0)
            {
                return ResultModel<WebhookSubscriptionViewModel>.Success(data);
            }
            return ResultModel<WebhookSubscriptionViewModel>.Error(_stringLocalizer["not_exists_entity"]);
        }

        /// <summary>
        /// Create or upsert subscription by callback_url
        /// </summary>
        [HttpPost]
        public async Task<ResultModel<WebhookSubscriptionViewModel>> UpsertAsync(WebhookSubscriptionViewModel viewModel)
        {
            var (id, msg, data) = await _service.UpsertAsync(viewModel, CurrentUser);
            if (id > 0)
            {
                return ResultModel<WebhookSubscriptionViewModel>.Success(data);
            }
            return ResultModel<WebhookSubscriptionViewModel>.Error(msg);
        }

        /// <summary>
        /// Delete subscription
        /// </summary>
        [HttpDelete("{id:int}")]
        public async Task<ResultModel<string>> DeleteAsync(int id)
        {
            var (flag, msg) = await _service.DeleteAsync(id, CurrentUser);
            if (flag)
            {
                return ResultModel<string>.Success(msg);
            }
            return ResultModel<string>.Error(msg);
        }
    }
}

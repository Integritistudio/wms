import { FailedItem } from '../database/entities/failed-item.entity.js';

/** Shape expected by wms-app-backend FailedOrdersPanel / toPublic() */
export function toPublicFailure(item: FailedItem) {
  return {
    id: item.id,
    orderId: item.externalOrderId,
    shopId: item.externalShopId,
    companyId: item.externalCompanyId,
    warehouseId: item.externalWarehouseId,
    reason: item.reason,
    errorMessage: item.errorMessage,
    attempts: item.attempts,
    maxAttempts: item.maxAttempts,
    status: item.status,
    resolvedAt: item.resolvedAt,
    resolvedBy: item.resolvedBy,
    resolution: item.resolution,
    autoRetryEnabled: item.autoRetryEnabled,
    nextRetryAt: item.nextRetryAt,
    lastRetryAt: item.lastRetryAt,
    note: item.note,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

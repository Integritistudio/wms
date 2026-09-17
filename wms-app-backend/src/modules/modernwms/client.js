const crypto = require("crypto");
const env = require("../../config/env");
const logger = require("../../config/logger");

const tokenCache = new Map();
const REQUEST_TIMEOUT_MS = 30000;

function md5(text) {
  return crypto.createHash("md5").update(String(text)).digest("hex");
}

function cacheKey(baseUrl, username) {
  return `${baseUrl}::${username}`;
}

function unwrapResult(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid ModernWMS response");
  }
  const ok = body.isSuccess ?? body.IsSuccess;
  if (!ok) {
    throw new Error(body.errorMessage || body.ErrorMessage || "ModernWMS request failed");
  }
  return body.data ?? body.Data;
}

function createMockState() {
  const dispatches = new Map();
  let seq = 1000;
  return {
    dispatches,
    nextNo() {
      seq += 1;
      return `DL${seq}`;
    },
  };
}

let mockState = null;

function getMockState() {
  if (!mockState) mockState = createMockState();
  return mockState;
}

function resetMockState() {
  mockState = createMockState();
}

function setMockDispatchDelivered(dispatchNo, { waybillNo = "MOCK-TRACK-1", carrier = "UPS" } = {}) {
  const state = getMockState();
  for (const [key, row] of state.dispatches.entries()) {
    if (row.dispatch_no === dispatchNo) {
      row.dispatch_status = 6;
      row.waybill_no = waybillNo;
      row.carrier = carrier;
      state.dispatches.set(key, row);
    }
  }
}

function isMockMode() {
  return process.env.MOCK_MODERNWMS === "1" || process.env.MOCK_MODERNWMS === "true";
}

async function mockRequest(baseUrl, path, { method = "GET", body, token } = {}) {
  const state = getMockState();
  const p = path.replace(/^\//, "");

  if (p === "login" && method === "POST") {
    return {
      isSuccess: true,
      data: {
        access_token: "mock-token",
        refresh_token: "mock-refresh",
        expire: Date.now() + 3600000,
        tenant_id: 1,
        user_name: body.user_name,
      },
    };
  }

  if (p === "hello-world" && method === "POST") {
    return { isSuccess: true, data: "hello" };
  }

  if (p === "dispatchlist" && method === "POST" && Array.isArray(body)) {
    const dispatchNo = state.nextNo();
    const status = 0;
    for (const line of body) {
      state.dispatches.set(`${dispatchNo}:${line.sku_id}`, {
        dispatch_no: dispatchNo,
        dispatch_status: status,
        customer_id: line.customer_id,
        customer_name: line.customer_name,
        sku_id: line.sku_id,
        qty: line.qty,
        waybill_no: "",
        carrier: "",
        create_time: new Date().toISOString(),
      });
    }
    return { isSuccess: true, data: "save_success" };
  }

  if (p.startsWith("dispatchlist/by-dispatch_no") && method === "GET") {
    const dispatchNo = new URL(`http://x/${p}`).searchParams.get("dispatch_no");
    const rows = [...state.dispatches.values()].filter((r) => r.dispatch_no === dispatchNo);
    return { isSuccess: true, data: rows };
  }

  if (p === "dispatchlist/list" && method === "POST") {
    const rows = [...state.dispatches.values()];
    return { isSuccess: true, data: { rows, totals: rows.length } };
  }

  if (p.startsWith("spu/sku-bar-code") && method === "GET") {
    const barCode = new URL(`http://x/${p}`).searchParams.get("bar_code");
    return {
      isSuccess: true,
      data: {
        id: Math.abs(crypto.createHash("md5").update(String(barCode)).digest().readUInt32BE(0) % 100000) + 1,
        bar_code: barCode,
        sku_code: barCode,
      },
    };
  }

  if (p === "stock/stock-list" && method === "POST") {
    return {
      isSuccess: true,
      data: {
        rows: [
          { sku_code: "SKU-A", sku_id: 1, qty: 100, qty_available: 90 },
          { sku_code: "SKU-B", sku_id: 2, qty: 50, qty_available: 50 },
        ],
        totals: 2,
      },
    };
  }

  if (p === "dispatchlist" && method === "DELETE") {
    return { isSuccess: true, data: "delete_success" };
  }

  if (p === "dispatchlist/delivery" && method === "POST") {
    const dispatchNo = body?.dispatch_no || body?.[0]?.dispatch_no;
    for (const [key, row] of state.dispatches.entries()) {
      if (row.dispatch_no === dispatchNo) {
        row.dispatch_status = 6;
        row.waybill_no = body?.waybill_no || "MOCK-TRACK-1";
        row.carrier = body?.carrier || "UPS";
        state.dispatches.set(key, row);
      }
    }
    return { isSuccess: true, data: "delivery_success" };
  }

  // ASN / inbound stubs for return restock
  if (p === "warehouse/all" && method === "GET") {
    return { isSuccess: true, data: [{ id: 1, warehouse_name: "Mock WH" }] };
  }
  if (p.startsWith("warehousearea/areas-by-warehouse_id") && method === "GET") {
    return { isSuccess: true, data: [{ value: 1, label: "MAIN", id: 1, area_name: "MAIN" }] };
  }
  if (p.startsWith("goodslocation/location-by-warehouseare_id") && method === "GET") {
    return { isSuccess: true, data: [{ value: 1, label: "A-01-01", id: 1, location_name: "A-01-01" }] };
  }
  if (p === "goodsowner/all" && method === "GET") {
    return { isSuccess: true, data: [{ id: 1, goods_owner_name: "Mock Owner" }] };
  }
  if (p === "asn/asnmaster" && method === "POST") {
    state.asnSeq = (state.asnSeq || 0) + 1;
    const masterId = state.asnSeq;
    state.asns = state.asns || new Map();
    const detailList = (body?.detailList || []).map((line, i) => ({
      id: masterId * 100 + i + 1,
      ...line,
      asn_qty: line.asn_qty,
    }));
    state.asns.set(masterId, { id: masterId, detailList });
    return { isSuccess: true, data: masterId };
  }
  if (p.startsWith("asn/asnmaster") && method === "GET") {
    const id = Number(new URL(`http://x/${p}`).searchParams.get("id"));
    const master = state.asns?.get(id) || { id, detailList: [] };
    return { isSuccess: true, data: master };
  }
  if (p === "asn/confirm" && method === "PUT") {
    return { isSuccess: true, data: true };
  }
  if (p === "asn/unload" && method === "PUT") {
    return { isSuccess: true, data: true };
  }
  if (p === "asn/sorting" && method === "PUT") {
    return { isSuccess: true, data: true };
  }
  if (p === "asn/sorted" && method === "PUT") {
    return { isSuccess: true, data: true };
  }
  if (p.startsWith("asn/pending-putaway") && method === "GET") {
    const asnId = Number(new URL(`http://x/${p}`).searchParams.get("id"));
    const master = [...(state.asns?.values() || [])].find((m) =>
      (m.detailList || []).some((line) => line.id === asnId)
    );
    const line = master?.detailList?.find((l) => l.id === asnId);
    const sortedQty = Number(line?.asn_qty || 1);
    return {
      isSuccess: true,
      data: [{ asn_id: asnId, sorted_qty: sortedQty, series_number: `MOCK-${asnId}` }],
    };
  }
  if (p === "asn/putaway" && method === "PUT") {
    return { isSuccess: true, data: true };
  }
  if (p === "stock/location-list" && method === "POST") {
    return {
      isSuccess: true,
      data: {
        rows: [
          {
            sku_code: "SKU-A",
            sku_id: 1,
            qty: 100,
            qty_available: 90,
            goods_location_id: 1,
            location_name: "A-01-01",
          },
        ],
        totals: 1,
      },
    };
  }

  throw new Error(`Mock ModernWMS: unhandled ${method} ${path}`);
}

function tokenExpiresAt(expire) {
  const raw = Number(expire);
  if (!raw || Number.isNaN(raw)) {
    return Date.now() + 3600000;
  }
  // ModernWMS returns minutes (e.g. 60), not epoch ms.
  if (raw < 1e12) {
    return Date.now() + raw * 60 * 1000;
  }
  return raw;
}

class ModernWmsClient {
  constructor({ baseUrl, username, password, tenantId = null }) {
    this.baseUrl = String(baseUrl || env.modernwmsDefaultBaseUrl).replace(/\/+$/, "");
    this.username = username;
    this.password = password;
    this.tenantId = tenantId;
  }

  async request(path, { method = "GET", body, auth = true } = {}) {
    if (isMockMode()) {
      const json = await mockRequest(this.baseUrl, path, { method, body, token: this.accessToken });
      return unwrapResult(json);
    }

    const headers = { Accept: "application/json" };
    const hasBody = body !== undefined;
    if (hasBody || (method !== "GET" && method !== "HEAD" && method !== "DELETE")) {
      headers["Content-Type"] = "application/json";
    }
    if (auth) {
      const token = await this.ensureToken();
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(`${this.baseUrl}/${path.replace(/^\//, "")}`, {
        method,
        headers,
        body: hasBody
          ? JSON.stringify(body)
          : method === "POST" || method === "PUT" || method === "PATCH"
            ? "{}"
            : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`ModernWMS request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`ModernWMS non-JSON response (${res.status})`);
    }

    if (!res.ok && !(json.isSuccess ?? json.IsSuccess)) {
      throw new Error(json.errorMessage || json.ErrorMessage || `ModernWMS HTTP ${res.status}`);
    }

    return unwrapResult(json);
  }

  async ensureToken() {
    const key = cacheKey(this.baseUrl, this.username);
    const cached = tokenCache.get(key);
    if (cached && cached.expires > Date.now() + 30000) {
      this.accessToken = cached.token;
      this.tenantId = cached.tenantId ?? this.tenantId;
      return cached.token;
    }

    const data = await this.request("/login", {
      method: "POST",
      auth: false,
      body: {
        user_name: this.username,
        password: md5(this.password),
      },
    });

    const token = data.access_token;
    const expires = tokenExpiresAt(data.expire);
    tokenCache.set(key, { token, expires, tenantId: data.tenant_id });
    this.accessToken = token;
    this.tenantId = data.tenant_id ?? this.tenantId;
    return token;
  }

  async testConnection() {
    await this.ensureToken();
    const hello = await this.request("/hello-world", { method: "POST", auth: true });
    return {
      ok: true,
      tenantId: this.tenantId,
      message: typeof hello === "string" ? hello : "connected",
    };
  }

  async getSkuByBarCode(barCode) {
    const q = new URLSearchParams({ bar_code: String(barCode) });
    return this.request(`spu/sku-bar-code?${q.toString()}`);
  }

  async createDispatch(lines) {
    return this.request("/dispatchlist", { method: "POST", body: lines });
  }

  async getDispatchByNo(dispatchNo) {
    const q = new URLSearchParams({ dispatch_no: String(dispatchNo) });
    return this.request(`dispatchlist/by-dispatch_no?${q.toString()}`);
  }

  async listDispatches(pageSearch = {}) {
    const data = await this.request("/dispatchlist/list", {
      method: "POST",
      body: {
        pageIndex: pageSearch.pageIndex || 1,
        pageSize: pageSearch.pageSize || 20,
        searchObjects: pageSearch.searchObjects || [],
      },
    });
    return data.rows || data.Rows || [];
  }

  async deleteDispatch(dispatchNo) {
    const q = new URLSearchParams({ dispatch_no: String(dispatchNo) });
    return this.request(`dispatchlist?${q.toString()}`, { method: "DELETE" });
  }

  async confirmOrder(details) {
    return this.request("/dispatchlist/confirm-order", { method: "POST", body: details });
  }

  async stockList(pageSearch = {}) {
    const data = await this.request("/stock/stock-list", {
      method: "POST",
      body: {
        pageIndex: pageSearch.pageIndex || 1,
        pageSize: pageSearch.pageSize || 500,
        searchObjects: pageSearch.searchObjects || [],
      },
    });
    return data.rows || data.Rows || [];
  }

  async locationStockList(pageSearch = {}) {
    const data = await this.request("/stock/location-list", {
      method: "POST",
      body: {
        pageIndex: pageSearch.pageIndex || 1,
        pageSize: pageSearch.pageSize || 500,
        searchObjects: pageSearch.searchObjects || [],
      },
    });
    return data.rows || data.Rows || [];
  }

  async listWarehouses() {
    return this.request("/warehouse/all");
  }

  async listGoodsOwners() {
    return this.request("/goodsowner/all");
  }

  async listAreasByWarehouse(warehouseId) {
    const q = new URLSearchParams({ warehouse_id: String(warehouseId) });
    return this.request(`warehousearea/areas-by-warehouse_id?${q.toString()}`);
  }

  async listLocationsByArea(areaId) {
    const q = new URLSearchParams({ warehousearea_id: String(areaId) });
    return this.request(`goodslocation/location-by-warehouseare_id?${q.toString()}`);
  }

  async createAsnMaster(payload) {
    return this.request("/asn/asnmaster", { method: "POST", body: payload });
  }

  async getAsnMaster(id) {
    const q = new URLSearchParams({ id: String(id) });
    return this.request(`asn/asnmaster?${q.toString()}`);
  }

  async confirmAsn(lines) {
    return this.request("/asn/confirm", { method: "PUT", body: lines });
  }

  async unloadAsn(lines) {
    return this.request("/asn/unload", { method: "PUT", body: lines });
  }

  async sortAsn(batch) {
    return this.request("/asn/sorting", { method: "PUT", body: batch });
  }

  async markAsnSorted(lineIds) {
    return this.request("/asn/sorted", { method: "PUT", body: lineIds });
  }

  async pendingPutaway(asnLineId) {
    const q = new URLSearchParams({ id: String(asnLineId) });
    return this.request(`asn/pending-putaway?${q.toString()}`);
  }

  async putawayAsn(batch) {
    return this.request("/asn/putaway", { method: "PUT", body: batch });
  }
}

function clientFromWarehouse(warehouse) {
  const cfg = warehouse.modernwms || {};
  const { decrypt } = require("../../utils/secret");
  const password = decrypt(cfg.passwordEncrypted);
  if (!cfg.baseUrl || !cfg.username || !password) {
    throw new Error("ModernWMS connection is not fully configured");
  }
  return new ModernWmsClient({
    baseUrl: cfg.baseUrl,
    username: cfg.username,
    password,
    tenantId: cfg.tenantId,
  });
}

function clearTokenCache() {
  tokenCache.clear();
}

module.exports = {
  ModernWmsClient,
  clientFromWarehouse,
  md5,
  isMockMode,
  resetMockState,
  setMockDispatchDelivered,
  clearTokenCache,
};

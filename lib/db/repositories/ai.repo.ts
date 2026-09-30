import { executeQuery } from '@/lib/db/pool';

export type AiProviderType = 'openai' | 'gemini' | 'anthropic' | 'custom';

export type AiDataRetention = 'unknown' | 'zero-retention' | 'training-opt-out';

export interface AiProvider {
  id: string;
  name: string;
  type: AiProviderType;
  base_url: string | null;
  priority_order: number;
  is_enabled: boolean;
  failure_count: number;
  disabled_until: Date | null;
  supports_vision: boolean;
  supports_json_mode: boolean;
  // CMP-10: per-provider data-retention posture. Patient data may only flow
  // to providers recorded as 'zero-retention' (or 'training-opt-out' with
  // documented consent); 'unknown' providers are blocked for patient data.
  data_retention: AiDataRetention;
}

export interface AiApiKey {
  id: string;
  provider_id: string;
  key_encrypted: string;
  key_hint: string;
  name: string | null;
  is_active: boolean;
  last_used_at: Date | null;
  last_rotated_at: Date | null;
}

export interface AiUsageInsert {
  providerId: string;
  apiKeyId: string | null;
  doctorId: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  responseTimeMs: number;
  success: boolean;
  errorMessage: string | null;
  requestType: string;
}

export interface MonthlyUsage {
  calls: number;
  tokens: number;
  cost: number;
}

export type RetryStatus = 'queued' | 'processing' | 'done' | 'dead_letter';

export interface RetryItem {
  id: string;
  doctor_id: string | null;
  request_type: string;
  payload: string;
  attempts: number;
  status: RetryStatus;
}

const PROVIDER_SELECT =
  'SELECT id, name, type, base_url, priority_order, is_enabled, failure_count, disabled_until, supports_vision, supports_json_mode, data_retention';

function mapProvider(row: Record<string, unknown>): AiProvider {
  const retention = row.data_retention as string | null | undefined;
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as AiProviderType,
    base_url: (row.base_url as string | null) ?? null,
    priority_order: Number(row.priority_order),
    is_enabled: Boolean(row.is_enabled),
    failure_count: Number(row.failure_count),
    disabled_until: row.disabled_until ? new Date(row.disabled_until as string) : null,
    supports_vision: Boolean(row.supports_vision),
    supports_json_mode: Boolean(row.supports_json_mode),
    data_retention: retention === 'zero-retention' || retention === 'training-opt-out' ? retention : 'unknown',
  };
}

export const aiProviderRepository = {
  // Chain order: enabled first by priority; temporarily-disabled rows stay
  // visible so the chain can skip them until disabled_until passes (AI-09).
  listChain: async (): Promise<AiProvider[]> => {
    const rows = await executeQuery<Record<string, unknown>[]>(
      PROVIDER_SELECT + ' FROM AiProvider WHERE is_enabled = TRUE ORDER BY priority_order ASC',
      []
    );
    return rows.map(mapProvider);
  },

  listAll: async (): Promise<AiProvider[]> => {
    const rows = await executeQuery<Record<string, unknown>[]>(
      PROVIDER_SELECT + ' FROM AiProvider ORDER BY priority_order ASC'
    );
    return rows.map(mapProvider);
  },

  update: async (id: string, patch: { isEnabled?: boolean; priorityOrder?: number; baseUrl?: string | null; name?: string; dataRetention?: AiDataRetention }): Promise<void> => {
    const fields: string[] = [];
    const values: Array<string | number | boolean | null> = [];
    if (patch.isEnabled !== undefined) {
      fields.push('is_enabled = ?');
      values.push(patch.isEnabled);
    }
    if (patch.priorityOrder !== undefined) {
      fields.push('priority_order = ?');
      values.push(patch.priorityOrder);
    }
    if (patch.baseUrl !== undefined) {
      fields.push('base_url = ?');
      values.push(patch.baseUrl);
    }
    if (patch.name !== undefined) {
      fields.push('name = ?');
      values.push(patch.name);
    }
    if (patch.dataRetention !== undefined) {
      if (!['unknown', 'zero-retention', 'training-opt-out'].includes(patch.dataRetention)) return;
      fields.push('data_retention = ?');
      values.push(patch.dataRetention);
    }
    if (fields.length === 0) return;
    values.push(id);
    // eslint-disable-next-line no-restricted-syntax -- SET columns are fixed literals; values use ? placeholders (D-01)
    await executeQuery(`UPDATE AiProvider SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  findById: async (id: string): Promise<AiProvider | null> => {
    const rows = await executeQuery<Record<string, unknown>[]>(PROVIDER_SELECT + ' FROM AiProvider WHERE id = ?', [id]);
    return rows.length > 0 ? mapProvider(rows[0]) : null;
  },

  recordFailure: async (id: string, failureCount: number, disabledUntil: Date | null): Promise<void> => {
    await executeQuery('UPDATE AiProvider SET failure_count = ?, disabled_until = ? WHERE id = ?', [
      failureCount,
      disabledUntil,
      id,
    ]);
  },

  recordSuccess: async (id: string): Promise<void> => {
    await executeQuery('UPDATE AiProvider SET failure_count = 0, disabled_until = NULL WHERE id = ?', [id]);
  },

  probeResult: async (id: string, ok: boolean): Promise<void> => {
    if (ok) {
      await executeQuery('UPDATE AiProvider SET failure_count = 0, disabled_until = NULL WHERE id = ?', [id]);
    } else {
      await executeQuery('UPDATE AiProvider SET failure_count = failure_count + 1 WHERE id = ?', [id]);
    }
  },
};

export const aiKeyRepository = {
  listActiveByProvider: async (providerId: string): Promise<AiApiKey[]> => {
    return executeQuery<AiApiKey[]>(
      'SELECT id, provider_id, key_encrypted, key_hint, name, is_active, last_used_at, last_rotated_at FROM AiApiKey WHERE provider_id = ? AND is_active = TRUE ORDER BY created_at ASC',
      [providerId]
    );
  },

  // Masked admin view: key_encrypted is NEVER selected here (§6.6).
  listMaskedByProvider: async (providerId: string): Promise<Array<{ id: string; name: string | null; key_hint: string; is_active: boolean | number; last_used_at: Date | null; last_rotated_at: Date | null }>> => {
    return executeQuery<Array<{ id: string; name: string | null; key_hint: string; is_active: boolean | number; last_used_at: Date | null; last_rotated_at: Date | null }>>(
      'SELECT id, name, key_hint, is_active, last_used_at, last_rotated_at FROM AiApiKey WHERE provider_id = ? ORDER BY created_at ASC',
      [providerId]
    );
  },

  updateMeta: async (id: string, patch: { name?: string | null; isActive?: boolean }): Promise<void> => {
    const fields: string[] = [];
    const values: Array<string | boolean | null> = [];
    if (patch.name !== undefined) {
      fields.push('name = ?');
      values.push(patch.name);
    }
    if (patch.isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(patch.isActive);
    }
    if (fields.length === 0) return;
    values.push(id);
    // eslint-disable-next-line no-restricted-syntax -- SET columns are fixed literals; values use ? placeholders (D-01)
    await executeQuery(`UPDATE AiApiKey SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  insert: async (data: { id: string; providerId: string; keyEncrypted: string; keyHint: string; name?: string | null }): Promise<void> => {
    await executeQuery(
      'INSERT INTO AiApiKey (id, provider_id, key_encrypted, key_hint, name, is_active) VALUES (?, ?, ?, ?, ?, TRUE)',
      [data.id, data.providerId, data.keyEncrypted, data.keyHint, data.name ?? null]
    );
  },

  rotate: async (id: string, keyEncrypted: string, keyHint: string): Promise<void> => {
    await executeQuery(
      'UPDATE AiApiKey SET key_encrypted = ?, key_hint = ?, last_rotated_at = ? WHERE id = ?',
      [keyEncrypted, keyHint, new Date(), id]
    );
  },

  remove: async (id: string): Promise<void> => {
    await executeQuery('DELETE FROM AiApiKey WHERE id = ?', [id]);
  },

  touchUsed: async (id: string): Promise<void> => {
    await executeQuery('UPDATE AiApiKey SET last_used_at = ? WHERE id = ?', [new Date(), id]);
  },
};

export const aiUsageRepository = {
  insert: async (data: AiUsageInsert): Promise<void> => {
    await executeQuery(
      `INSERT INTO AiUsageLog (provider_id, api_key_id, doctor_id, prompt_tokens, completion_tokens, total_tokens, estimated_cost, response_time_ms, success, error_message, request_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.providerId,
        data.apiKeyId,
        data.doctorId,
        data.promptTokens,
        data.completionTokens,
        data.promptTokens + data.completionTokens,
        data.estimatedCost,
        data.responseTimeMs,
        data.success,
        data.errorMessage,
        data.requestType,
      ]
    );
  },

  monthlyForDoctor: async (doctorId: string): Promise<MonthlyUsage> => {
    const rows = await executeQuery<{ calls: number; tokens: number; cost: number | string }[]>(
      `SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens, COALESCE(SUM(estimated_cost), 0) as cost
       FROM AiUsageLog WHERE doctor_id = ? AND success = TRUE AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)`,
      [doctorId]
    );
    const r = rows[0];
    return { calls: Number(r.calls), tokens: Number(r.tokens), cost: Number(r.cost) };
  },

  // Plan-level call cap for quota overrides (AI-11).
  planCallCap: async (userId: string): Promise<number | null> => {    const rows = await executeQuery<{ max_ai_calls_monthly: number | null }[]>(
      `SELECT sp.max_ai_calls_monthly FROM User u
       LEFT JOIN SubscriptionPlan sp ON sp.id = u.subscription_plan_id
       WHERE u.id = ?`,
      [userId]
    );
    if (rows.length === 0 || rows[0].max_ai_calls_monthly === null) return null;
    return Number(rows[0].max_ai_calls_monthly);
  },

  // ADM-23 explorer + aggregates. Estimated cost is stored per call (USD).
  explore: async (filters: { providerId?: string; doctorId?: string; from?: string; to?: string; success?: boolean; page?: number; limit?: number }): Promise<{ rows: Record<string, unknown>[]; total: number }> => {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;
    const where: string[] = [];
    const params: Array<string | number | boolean> = [];
    if (filters.providerId) {
      where.push('l.provider_id = ?');
      params.push(filters.providerId);
    }
    if (filters.doctorId) {
      where.push('l.doctor_id = ?');
      params.push(filters.doctorId);
    }
    if (filters.from) {
      where.push('l.created_at >= ?');
      params.push(filters.from);
    }
    if (filters.to) {
      where.push('l.created_at <= ?');
      params.push(filters.to);
    }
    if (filters.success !== undefined) {
      where.push('l.success = ?');
      params.push(filters.success);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await executeQuery<Record<string, unknown>[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
      `SELECT l.*, p.type AS provider_type, u.name AS doctor_name FROM AiUsageLog l
       LEFT JOIN AiProvider p ON p.id = l.provider_id LEFT JOIN User u ON u.id = l.doctor_id
       ${clause} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRows = await executeQuery<{ count: number }[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
      `SELECT COUNT(*) as count FROM AiUsageLog l ${clause}`,
      params
    );
    return { rows, total: totalRows[0].count };
  },

  monthTotals: async (from: string, to: string): Promise<{ calls: number; tokens: number; cost: number }> => {
    const rows = await executeQuery<{ calls: number; tokens: number | string; cost: number | string }[]>(
      'SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens, COALESCE(SUM(estimated_cost), 0) as cost FROM AiUsageLog WHERE created_at >= ? AND created_at <= ?',
      [from, to]
    );
    return { calls: Number(rows[0].calls), tokens: Number(rows[0].tokens), cost: Number(rows[0].cost) };
  },

  byDoctor: async (from: string, to: string, limit = 10): Promise<Array<{ doctor_id: string | null; doctor_name: string; calls: number; tokens: number; cost: number }>> => {
    const rows = await executeQuery<Array<{ doctor_id: string | null; doctor_name: string; calls: number; tokens: number | string; cost: number | string }>>(
      `SELECT l.doctor_id, COALESCE(u.name, '—') AS doctor_name, COUNT(*) AS calls,
        COALESCE(SUM(l.total_tokens), 0) AS tokens, COALESCE(SUM(l.estimated_cost), 0) AS cost
       FROM AiUsageLog l LEFT JOIN User u ON u.id = l.doctor_id
       WHERE l.created_at >= ? AND l.created_at <= ? GROUP BY l.doctor_id, u.name
       ORDER BY cost DESC LIMIT ?`,
      [from, to, limit]
    );
    return rows.map((r) => ({ ...r, calls: Number(r.calls), tokens: Number(r.tokens), cost: Number(r.cost) }));
  },

  byProvider: async (from: string, to: string): Promise<Array<{ provider_id: string; provider_type: string; calls: number; success_rate: number; cost: number }>> => {
    const rows = await executeQuery<Array<{ provider_id: string; provider_type: string; calls: number; successes: number; cost: number | string }>>(
      `SELECT l.provider_id, COALESCE(p.type, 'unknown') AS provider_type, COUNT(*) AS calls,
        SUM(CASE WHEN l.success = TRUE THEN 1 ELSE 0 END) AS successes, COALESCE(SUM(l.estimated_cost), 0) AS cost
       FROM AiUsageLog l LEFT JOIN AiProvider p ON p.id = l.provider_id
       WHERE l.created_at >= ? AND l.created_at <= ? GROUP BY l.provider_id, p.type`,
      [from, to]
    );
    return rows.map((r) => ({
      provider_id: r.provider_id, provider_type: r.provider_type, calls: Number(r.calls),
      success_rate: Number(r.calls) === 0 ? 0 : Math.round((Number(r.successes) / Number(r.calls)) * 1000) / 10,
      cost: Number(r.cost),
    }));
  },

  dailyTrend: async (from: string, to: string): Promise<Array<{ day: string; calls: number; cost: number }>> => {
    const rows = await executeQuery<Array<{ day: string; calls: number; cost: number | string }>>(
      `SELECT DATE(created_at) AS day, COUNT(*) AS calls, COALESCE(SUM(estimated_cost), 0) AS cost
       FROM AiUsageLog WHERE created_at >= ? AND created_at <= ? GROUP BY DATE(created_at) ORDER BY day ASC`,
      [from, to]
    );
    return rows.map((r) => ({ day: String(r.day), calls: Number(r.calls), cost: Number(r.cost) }));
  },

  keyStats: async (keyId: string): Promise<{ calls: number; cost: number; last_used: Date | null }> => {
    const rows = await executeQuery<Array<{ calls: number; cost: number | string; last_used: Date | null }>>(
      'SELECT COUNT(*) AS calls, COALESCE(SUM(estimated_cost), 0) AS cost, MAX(created_at) AS last_used FROM AiUsageLog WHERE api_key_id = ?',
      [keyId]
    );
    return { calls: Number(rows[0].calls), cost: Number(rows[0].cost), last_used: rows[0].last_used };
  },
};

export const aiRetryRepository = {
  enqueue: async (id: string, doctorId: string | null, requestType: string, payload: unknown): Promise<void> => {
    await executeQuery('INSERT INTO AiRetryQueue (id, doctor_id, request_type, payload, attempts, status) VALUES (?, ?, ?, ?, 0, ?)', [
      id,
      doctorId,
      requestType,
      JSON.stringify(payload),
      'queued',
    ]);
  },

  claimDue: async (limit: number): Promise<RetryItem[]> => {
    const rows = await executeQuery<RetryItem[]>(
      "SELECT id, doctor_id, request_type, payload, attempts, status FROM AiRetryQueue WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?",
      [limit]
    );
    return rows;
  },

  markProcessing: async (id: string): Promise<void> => {
    await executeQuery("UPDATE AiRetryQueue SET status = 'processing', attempts = attempts + 1 WHERE id = ?", [id]);
  },

  markDone: async (id: string): Promise<void> => {
    await executeQuery("UPDATE AiRetryQueue SET status = 'done' WHERE id = ?", [id]);
  },

  markRequeued: async (id: string, lastError: string): Promise<void> => {
    await executeQuery("UPDATE AiRetryQueue SET status = 'queued', last_error = ? WHERE id = ?", [lastError.slice(0, 2000), id]);
  },

  markDeadLetter: async (id: string, lastError: string): Promise<void> => {
    await executeQuery("UPDATE AiRetryQueue SET status = 'dead_letter', last_error = ? WHERE id = ?", [lastError.slice(0, 2000), id]);
  },
};

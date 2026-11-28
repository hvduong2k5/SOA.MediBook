import { HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { ProblemException } from '../common/problem-details';

/**
 * PostgreSQL pool wrapper for consumer_db with transaction helper.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;

  constructor() {
    const connectionString =
      process.env.CONSUMER_DB_URL ||
      'postgresql://postgres:postgres@localhost:5432/consumer_db';
    this.pool = new Pool({ connectionString });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    try {
      return await this.pool.query<T>(text, params);
    } catch (err) {
      this.rethrowIfDbUnavailable(err);
      throw err;
    }
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (err) {
      this.rethrowIfDbUnavailable(err);
      throw err;
    }

    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private rethrowIfDbUnavailable(err: unknown): void {
    const pgErr = err as { code?: string };
    if (pgErr?.code === 'ECONNREFUSED' || pgErr?.code === '57P01' || pgErr?.code === '53300') {
      throw new ProblemException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'DATABASE_UNAVAILABLE',
        'Không thể kết nối tới consumer_db.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

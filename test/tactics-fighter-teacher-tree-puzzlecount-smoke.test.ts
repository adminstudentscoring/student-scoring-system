/**
 * Postgres smoke: same COUNT pattern as GET /api/teachers/tactics-fighter/builder/tree
 * for per-subtopic puzzle totals (teacher Practice list uses puzzleCount).
 *
 * Skips when DATABASE_URL is unset or DB unreachable.
 * Run: pnpm test:tactics-fighter-tree
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Tactics Fighter teacher tree puzzleCount aggregation (DB smoke)', () => {
  it('COUNT per subtopic matches inserted puzzles (rolled back)', async (t) => {
    await import('dotenv/config');
    const { getPool } = await import('@student-scoring/core/src/db/postgres');
    const pool = getPool();
    if (!pool) {
      t.skip('no DATABASE_URL / pool');
      return;
    }

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const orgId = `tf_smoke_${suffix}`;
    const bucket = 'beginner';
    const fen = '8/8/8/8/8/8/8/8 w - - 0 1';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const cat = await client.query(
        `INSERT INTO tactics_fighter_categories (org_id, bucket, name)
         VALUES ($1, $2, $3) RETURNING id`,
        [orgId, bucket, `SmokeCat_${suffix}`]
      );
      const categoryId = Number(cat.rows[0].id);
      assert.ok(Number.isFinite(categoryId));

      const top = await client.query(
        `INSERT INTO tactics_fighter_topics (org_id, category_id, name)
         VALUES ($1, $2, $3) RETURNING id`,
        [orgId, categoryId, `SmokeTopic_${suffix}`]
      );
      const topicId = Number(top.rows[0].id);

      const subA = await client.query(
        `INSERT INTO tactics_fighter_subtopics (org_id, topic_id, name)
         VALUES ($1, $2, $3) RETURNING id`,
        [orgId, topicId, `SmokeSubA_${suffix}`]
      );
      const subB = await client.query(
        `INSERT INTO tactics_fighter_subtopics (org_id, topic_id, name)
         VALUES ($1, $2, $3) RETURNING id`,
        [orgId, topicId, `SmokeSubB_${suffix}`]
      );
      const subtopicIdA = Number(subA.rows[0].id);
      const subtopicIdB = Number(subB.rows[0].id);

      for (let i = 0; i < 3; i++) {
        await client.query(
          `INSERT INTO tactics_fighter_puzzles (org_id, subtopic_id, fen) VALUES ($1, $2, $3)`,
          [orgId, subtopicIdA, fen]
        );
      }
      await client.query(
        `INSERT INTO tactics_fighter_puzzles (org_id, subtopic_id, fen) VALUES ($1, $2, $3)`,
        [orgId, subtopicIdB, fen]
      );

      const subtopicIds = [subtopicIdA, subtopicIdB];
      const countsRes = await client.query(
        `SELECT subtopic_id, COUNT(*)::int AS cnt
         FROM tactics_fighter_puzzles
         WHERE org_id = $1 AND subtopic_id = ANY($2::bigint[])
         GROUP BY subtopic_id`,
        [orgId, subtopicIds]
      );
      const cntBySub = new Map(countsRes.rows.map((r) => [String(r.subtopic_id), Number(r.cnt)]));
      assert.strictEqual(cntBySub.get(String(subtopicIdA)), 3);
      assert.strictEqual(cntBySub.get(String(subtopicIdB)), 1);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});

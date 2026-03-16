// Blunders teacher job runner extracted from server.js.
// NOTE: This module intentionally uses `with (deps)` so we can move code without rewriting identifiers.
// Do NOT add "use strict" to this file (it would break `with`).

function createBlundersTeacherJobs(deps: any): any {
  const blundersTeacherJobQueue = [];
  let blundersTeacherJobRunnerRunning = false;
  const blundersTeacherJobCancel = new Set(); // jobId

  async function blundersTeacherRunNextJob() {
    // eslint-disable-next-line no-with
    with (deps) {
      if (blundersTeacherJobRunnerRunning) return;
      blundersTeacherJobRunnerRunning = true;
      try {
        while (blundersTeacherJobQueue.length) {
          const jobId = String(blundersTeacherJobQueue.shift() || '');
          if (!jobId) continue;
          if (blundersTeacherJobCancel.has(jobId)) continue;

          const jobs = await readBlundersTeacherJobs();
          const job = jobs[jobId] || null;
          if (!job || job.status === 'done' || job.status === 'error' || job.status === 'cancelled') continue;

          job.status = 'running';
          job.startedAt = nowIso();
          job.updatedAt = nowIso();
          jobs[jobId] = job;
          await writeBlundersTeacherJobs(jobs);

          try {
            if (job.type === 'blunders_history_scan') {
              const orgId = String(job.orgId || '');
              const studentIds = Array.isArray(job.params?.studentIds) ? job.params.studentIds.map(String) : [];
              const historyGames = Math.max(1, Math.min(500, Number(job.params?.historyGames || 0) || 200));
              const force = job.params?.force ? '1' : '0';
              const thresholdPoints = job.params?.thresholdPoints;

              const data = await readData();
              const studentsAll = Array.isArray(data?.students) ? data.students : [];
              const targets = studentsAll.filter(s => String(s.organizationId || '') === orgId && studentIds.includes(String(s.id || '')));

              job.progress = { total: targets.length, done: 0, message: `History scan queued (${targets.length})`, currentStudentId: null, currentStudentName: null };
              job.updatedAt = nowIso();
              jobs[jobId] = job;
              await writeBlundersTeacherJobs(jobs);

              for (let i = 0; i < targets.length; i++) {
                if (blundersTeacherJobCancel.has(jobId)) throw new Error('__CANCELLED__');
                const s = targets[i];
                job.progress = {
                  total: targets.length,
                  done: i,
                  message: `History scanning ${i + 1}/${targets.length} (N=${historyGames})...`,
                  currentStudentId: String(s.id || ''),
                  currentStudentName: String(s.name || 'Student')
                };
                job.updatedAt = nowIso();
                jobs[jobId] = job;
                await writeBlundersTeacherJobs(jobs);

                // Heavy work
                await syncBlundersForStudent(s, { mode: 'history', historyGames, force, thresholdPoints });

                job.progress = { ...(job.progress || {}), done: i + 1 };
                job.updatedAt = nowIso();
                jobs[jobId] = job;
                await writeBlundersTeacherJobs(jobs);
              }

              job.status = 'done';
              job.finishedAt = nowIso();
              job.updatedAt = nowIso();
              job.progress = { ...(job.progress || {}), message: 'Done.' };
              jobs[jobId] = job;
              await writeBlundersTeacherJobs(jobs);
            } else if (job.type === 'blunders_master_history_scan') {
              const orgId = String(job.orgId || '');
              const masterIds = Array.isArray(job.params?.masterIds) ? job.params.masterIds.map(String) : [];
              const historyGames = Math.max(1, Math.min(500, Number(job.params?.historyGames || 0) || 200));
              const force = job.params?.force ? '1' : '0';
              const thresholdPoints = job.params?.thresholdPoints;

              const org = await getOrgBlundersSettings(orgId);
              const mastersAll = Array.isArray(org?.masters) ? org.masters : [];
              const targets = mastersAll.filter(m => masterIds.includes(String(m.id || '')));

              job.progress = { total: targets.length, done: 0, message: `Master history scan queued (${targets.length})`, currentMasterId: null, currentMasterName: null };
              job.updatedAt = nowIso();
              jobs[jobId] = job;
              await writeBlundersTeacherJobs(jobs);

              for (let i = 0; i < targets.length; i++) {
                if (blundersTeacherJobCancel.has(jobId)) throw new Error('__CANCELLED__');
                const m = targets[i];
                job.progress = {
                  total: targets.length,
                  done: i,
                  message: `Master history scanning ${i + 1}/${targets.length} (N=${historyGames})...`,
                  currentMasterId: String(m.id || ''),
                  currentMasterName: String(m.name || m.username || 'Master')
                };
                job.updatedAt = nowIso();
                jobs[jobId] = job;
                await writeBlundersTeacherJobs(jobs);

                // Heavy work
                await syncBlundersForMaster(orgId, m, { mode: 'history', historyGames, force, thresholdPoints });

                job.progress = { ...(job.progress || {}), done: i + 1 };
                job.updatedAt = nowIso();
                jobs[jobId] = job;
                await writeBlundersTeacherJobs(jobs);
              }

              job.status = 'done';
              job.finishedAt = nowIso();
              job.updatedAt = nowIso();
              job.progress = { ...(job.progress || {}), message: 'Done.' };
              jobs[jobId] = job;
              await writeBlundersTeacherJobs(jobs);
            } else if (job.type === 'blunders_tag_puzzles') {
              const orgId = String(job.orgId || '');
              const scope = String(job.params?.scope || 'student'); // student | master | all
              const recompute = !!job.params?.recompute;
              const syncDb = job.params?.syncDb !== undefined ? !!job.params?.syncDb : true;

              const puzzles = await readBlundersPuzzles();
              const pool = appDb.getPool();
              const targets = puzzles.filter((p) => {
                if (String(p?.orgId || '') !== orgId) return false;
                const sc = String(p?.scope || '').trim();
                if (scope === 'student') return sc !== 'master';
                if (scope === 'master') return sc === 'master';
                return true;
              });

              job.progress = { total: targets.length, done: 0, tagged: 0, skipped: 0, message: `Tagging queued (${targets.length})`, scope };
              job.updatedAt = nowIso();
              jobs[jobId] = job;
              await writeBlundersTeacherJobs(jobs);

              const nowTaggedAt = nowIso();
              let done = 0;
              let tagged = 0;
              let skipped = 0;
              let lastFlushAtMs = 0;
              let flushedTagged = 0;
              let dbBatch = [];
              let dbSynced = 0;

              for (let i = 0; i < puzzles.length; i++) {
                if (blundersTeacherJobCancel.has(jobId)) throw new Error('__CANCELLED__');
                const p = puzzles[i];
                if (String(p?.orgId || '') !== orgId) continue;
                const sc = String(p?.scope || '').trim();
                const eligible =
                  (scope === 'student' && sc !== 'master') ||
                  (scope === 'master' && sc === 'master') ||
                  (scope === 'all');
                if (!eligible) continue;

                const curVer = String(p?.taggerVersion || '');
                const hasTags = Array.isArray(p?.tags) && p.tags.length > 0;
                const needs = recompute || !hasTags || curVer !== BLUNDERS_TAGGER_VERSION;
                if (!needs) {
                  // If tags already exist, we may still want to backfill Postgres.
                  if (syncDb && pool && sc !== 'master' && hasTags && curVer === BLUNDERS_TAGGER_VERSION) {
                    const key = String(p?.key || '').trim();
                    if (key) {
                      dbBatch.push({ key, tags: p.tags, taggerVersion: curVer, taggedAt: p?.taggedAt || nowTaggedAt });
                      dbSynced++;
                      if (dbBatch.length >= 200) {
                        await dbUpsertPuzzleTags(pool, dbBatch);
                        dbBatch = [];
                      }
                    }
                  }
                  skipped++; done++; continue;
                }

                try {
                  const tags = tagBlunderPuzzle(p);
                  p.tags = Array.isArray(tags) ? tags : [];
                  p.taggerVersion = BLUNDERS_TAGGER_VERSION;
                  p.taggedAt = nowTaggedAt;
                  tagged++;
                  // DB sync (student puzzles only)
                  if (syncDb && pool && sc !== 'master') {
                    const key = String(p?.key || '').trim();
                    if (key) dbBatch.push({ key, tags: p.tags, taggerVersion: BLUNDERS_TAGGER_VERSION, taggedAt: nowTaggedAt });
                    if (dbBatch.length >= 200) {
                      await dbUpsertPuzzleTags(pool, dbBatch);
                      dbBatch = [];
                    }
                  }
                } catch {
                  // Don't fail the whole job on a single puzzle.
                  skipped++;
                }
                done++;

                if (done % 200 === 0) {
                  job.progress = { ...(job.progress || {}), total: targets.length, done, tagged, skipped, dbSynced, message: `Tagging... ${done}/${targets.length}` };
                  job.updatedAt = nowIso();
                  jobs[jobId] = job;
                  await writeBlundersTeacherJobs(jobs);
                }

                // Incremental flush to avoid large lost work; rate-limited.
                const now = Date.now();
                if (tagged > flushedTagged && (now - lastFlushAtMs) > 2000) {
                  await writeBlundersPuzzles(puzzles);
                  flushedTagged = tagged;
                  lastFlushAtMs = now;
                }
              }

              // Final flush
              await writeBlundersPuzzles(puzzles);
              try {
                if (pool && dbBatch.length) await dbUpsertPuzzleTags(pool, dbBatch);
              } catch (e) {
                // dbUpsertPuzzleTags already enqueues retries; keep job successful.
                try {
                  job.progress = { ...(job.progress || {}), dbError: String(e?.message || e) };
                  job.updatedAt = nowIso();
                  jobs[jobId] = job;
                  await writeBlundersTeacherJobs(jobs);
                } catch {}
              }

              job.status = 'done';
              job.finishedAt = nowIso();
              job.updatedAt = nowIso();
              job.progress = { ...(job.progress || {}), total: targets.length, done, tagged, skipped, dbSynced, message: 'Done.' };
              jobs[jobId] = job;
              await writeBlundersTeacherJobs(jobs);
            } else {
              throw new Error(`Unknown job type: ${String(job.type || '')}`);
            }
          } catch (e) {
            if (String(e?.message || e) === '__CANCELLED__') {
              job.status = 'cancelled';
              job.finishedAt = nowIso();
              job.updatedAt = nowIso();
              job.progress = { ...(job.progress || {}), message: 'Cancelled.' };
            } else {
              job.status = 'error';
              job.finishedAt = nowIso();
              job.updatedAt = nowIso();
              job.error = String(e?.message || e);
              job.progress = { ...(job.progress || {}), message: `Error: ${job.error}` };
            }
            jobs[jobId] = job;
            await writeBlundersTeacherJobs(jobs);
          }
        }
      } finally {
        blundersTeacherJobRunnerRunning = false;
      }
    }
  }

  return { blundersTeacherJobQueue, blundersTeacherJobCancel, blundersTeacherRunNextJob };
}

module.exports = { createBlundersTeacherJobs };



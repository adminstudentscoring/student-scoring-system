/**
 * Smoke: timetable CRUD, makeup/postpone, teacher read-only timetable, attendance query.
 * Run: `pnpm test:timetable`
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  getRequest,
  registerTestOrg,
  stopTestServer,
  uniqueTestSuffix
} from './helpers/testServer';

const SUFFIX = uniqueTestSuffix();
let request: Awaited<ReturnType<typeof getRequest>>;
let orgToken = '';
let timetableEntryId = '';
let makeupTargetEntryId = '';
let studentId = '';
let teacherToken = '';

describe('Timetable API smoke', () => {
  before(async () => {
    request = await getRequest();
    const org = await registerTestOrg(request, {
      organizationName: `TimetableSmokeOrg_${SUFFIX}`,
      email: `timetable_smoke_${SUFFIX}@example.com`
    });
    orgToken = org.token;
  });

  after(() => {
    stopTestServer();
  });

  it('POST /api/organizations/timetable creates recurring entry', async () => {
    const res = await request
      .post('/api/organizations/timetable')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        className: `Smoke Class ${SUFFIX}`,
        startTime: '16:30',
        endTime: '17:30',
        isRecurring: true,
        dayOfWeek: ['Thursday'],
        startDate: '2026-04-02',
        courseIds: [],
        teacherIds: [],
        studentIds: []
      })
      .set('Content-Type', 'application/json');
    assert.strictEqual(res.status, 201, res.text);
    assert.ok(res.body.id);
    timetableEntryId = res.body.id;
    assert.strictEqual(res.body.isRecurring, true);
  });

  it('GET /api/organizations/timetable returns created entry', async () => {
    const res = await request
      .get('/api/organizations/timetable')
      .set('Authorization', `Bearer ${orgToken}`);
    assert.strictEqual(res.status, 200, res.text);
    assert.ok(Array.isArray(res.body.entries));
    const found = res.body.entries.find((e: { id: string }) => e.id === timetableEntryId);
    assert.ok(found, 'created entry should appear in list');
    assert.ok(Array.isArray(res.body.enrollments));
  });

  it('POST delete-instance adds exception for single date', async () => {
    const res = await request
      .post(`/api/organizations/timetable/${timetableEntryId}/delete-instance`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ date: '2026-04-09', mode: 'single' })
      .set('Content-Type', 'application/json');
    assert.strictEqual(res.status, 200, res.text);
    assert.strictEqual(res.body.success, true);

    const getRes = await request
      .get('/api/organizations/timetable')
      .set('Authorization', `Bearer ${orgToken}`);
    const entry = getRes.body.entries.find((e: { id: string }) => e.id === timetableEntryId);
    assert.ok(entry.exceptions?.includes('2026-04-09'));
  });

  it('GET /api/attendance returns array (empty ok)', async () => {
    const res = await request
      .get('/api/attendance')
      .set('Authorization', `Bearer ${orgToken}`);
    assert.strictEqual(res.status, 200, res.text);
    assert.ok(Array.isArray(res.body));
  });

  it('creates student and makeup target timetable entry', async () => {
    const studentRes = await request
      .post('/api/students')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ name: `Timetable Smoke Student ${SUFFIX}`, chessComId: `tt_smoke_${SUFFIX}` })
      .set('Content-Type', 'application/json');
    assert.strictEqual(studentRes.status, 200, studentRes.text);
    studentId = studentRes.body.id;

    const targetRes = await request
      .post('/api/organizations/timetable')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        className: `Makeup Target ${SUFFIX}`,
        startTime: '18:00',
        endTime: '19:00',
        isRecurring: false,
        date: '2026-04-16',
        courseIds: [],
        teacherIds: [],
        studentIds: []
      })
      .set('Content-Type', 'application/json');
    assert.strictEqual(targetRes.status, 201, targetRes.text);
    makeupTargetEntryId = targetRes.body.id;
  });

  it('POST /api/organizations/timetable/makeup enrolls student to target', async () => {
    const res = await request
      .post('/api/organizations/timetable/makeup')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        studentId,
        fromEntryId: timetableEntryId,
        fromDate: '2026-04-02',
        toEntryId: makeupTargetEntryId,
        toDate: '2026-04-16',
        studentName: `Timetable Smoke Student ${SUFFIX}`
      })
      .set('Content-Type', 'application/json');
    assert.strictEqual(res.status, 200, res.text);
    assert.strictEqual(res.body.success, true);

    const getRes = await request
      .get('/api/organizations/timetable')
      .set('Authorization', `Bearer ${orgToken}`);
    const enr = getRes.body.enrollments.find(
      (e: { studentId: string; timetableEntryId: string; date: string }) =>
        String(e.studentId) === String(studentId) &&
        e.timetableEntryId === makeupTargetEntryId &&
        e.date === '2026-04-16'
    );
    assert.ok(enr, 'makeup enrollment should exist');
  });

  it('POST /api/organizations/timetable/postpone moves enrollment forward', async () => {
    const res = await request
      .post('/api/organizations/timetable/postpone')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        timetableEntryId: makeupTargetEntryId,
        date: '2026-04-16',
        studentId
      })
      .set('Content-Type', 'application/json');
    assert.strictEqual(res.status, 200, res.text);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data?.enrolledToDate);
  });

  it('creates teacher and GET /api/teachers/timetable returns read-only data', async () => {
    const teacherUsername = `tt_teacher_${SUFFIX}`;
    const createTeacher = await request
      .post('/api/organizations/teachers')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        name: `Smoke Teacher ${SUFFIX}`,
        teacherId: `T${SUFFIX.slice(-6)}`,
        gender: 'male',
        username: teacherUsername,
        password: 'teacherpass123'
      })
      .set('Content-Type', 'application/json');
    assert.strictEqual(createTeacher.status, 201, createTeacher.text);

    const login = await request
      .post('/api/auth/login')
      .send({ email: teacherUsername, password: 'teacherpass123' })
      .set('Content-Type', 'application/json');
    assert.strictEqual(login.status, 200, login.text);
    teacherToken = login.body.token;

    const tt = await request
      .get('/api/teachers/timetable')
      .set('Authorization', `Bearer ${teacherToken}`);
    assert.strictEqual(tt.status, 200, tt.text);
    assert.ok(Array.isArray(tt.body.entries));
    assert.ok(tt.body.scheduleSettings !== undefined);
  });

  it('DELETE /api/organizations/timetable/:id removes entry', async () => {
    const del = await request
      .delete(`/api/organizations/timetable/${makeupTargetEntryId}`)
      .set('Authorization', `Bearer ${orgToken}`);
    assert.strictEqual(del.status, 200, del.text);
  });
});

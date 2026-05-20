#!/usr/bin/env node
import fs from 'fs';

const V = '20260521-split3';

const REPLACEMENTS = {
  'course-management-courses.js': [
    'course-management-courses-1.js',
    'course-management-courses-2.js',
    'course-management-courses-3.js'
  ],
  'course-management-packages.js': [
    'course-management-packages-1.js',
    'course-management-packages-2.js',
    'course-management-packages-3.js'
  ],
  'course-management-accounting.js': [
    'course-management-accounting-1.js',
    'course-management-accounting-2.js'
  ],
  'course-management-sales-core.js': [
    'course-management-sales-core-1.js',
    'course-management-sales-core-2.js'
  ],
  'course-management-sales-orders-student.js': [
    'course-management-sales-orders-student-1.js',
    'course-management-sales-orders-student-2.js'
  ],
  'teacher-core.js': ['teacher-core-1.js', 'teacher-core-2.js'],
  'teacher-students.js': ['teacher-students-1.js', 'teacher-students-2.js', 'teacher-students-3.js'],
  'teacher-games.js': ['teacher-games-1.js', 'teacher-games-2.js', 'teacher-games-3.js'],
  'teacher-classview.js': ['teacher-classview-1.js', 'teacher-classview-2.js'],
  'admin-subscription-setting.js': [
    'admin-subscription-setting-1.js',
    'admin-subscription-setting-2.js',
    'admin-subscription-setting-3.js'
  ],
  'admin-organization-tools.js': ['admin-organization-tools-1.js', 'admin-organization-tools-2.js'],
  'admin-organization-settings.js': [
    'admin-organization-settings-1.js',
    'admin-organization-settings-2.js'
  ],
  'class-view.js': ['class-view-1.js', 'class-view-2.js', 'class-view-3.js', 'class-view-4.js'],
  'student.js': ['student-1.js', 'student-2.js']
};

function expandScriptTag(match, src) {
  const parts = REPLACEMENTS[src];
  if (!parts) return match;
  return parts
    .map((p) => `    <script src="${p}?v=${V}"></script>`)
    .join('\n');
}

function updateHtml(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const src of Object.keys(REPLACEMENTS)) {
    const re = new RegExp(
      `    <script src="${src.replace('.', '\\.')}(\\?v=[^"]*)?"></script>`,
      'g'
    );
    if (re.test(html)) {
      html = html.replace(re, (m) => expandScriptTag(m, src));
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, html);
    console.log('updated', filePath);
  }
}

for (const f of [
  'public/organization.html',
  'public/teacher.html',
  'public/admin.html',
  'public/class-view.html',
  'public/student.html'
]) {
  updateHtml(f);
}

// chess-analysis index: entry only (loads parts via imports)
const chessIdx = 'public/chess-analysis/index.html';
let ch = fs.readFileSync(chessIdx, 'utf8');
ch = ch.replace(
  /<script type="module" src="chess-analysis-app\.js"><\/script>/,
  `<script type="module" src="chess-analysis-app.js?v=${V}"></script>`
);
fs.writeFileSync(chessIdx, ch);
console.log('updated', chessIdx);

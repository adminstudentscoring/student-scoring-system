// Statistics Management Module
// Handles statistics and analytics visualization

// State
let statisticsState = {
  currentSubTab: 'student-scores', // student-scores, org-overview, teacher-analysis, student-analysis
  studentScores: {
    viewMode: 'all', // all, teacher
    timePeriod: 'all-time', // all-time, yearly, monthly, weekly
    selectedTeacherId: 'all',
    currentDate: new Date(), // For navigating periods
  }
};

// Initialize Statistics Module
window.loadStatisticsModule = async function() {
  const container = document.getElementById('statisticsTab');
  if (!container) return;
  
  // Ensure user info is loaded
  if (!window.currentUser) {
      try {
          const response = await window.authUtils.authenticatedFetch('/auth/me');
          if (response.ok) window.currentUser = await response.json();
      } catch(e) {
          console.warn('Failed to load current user for statistics');
      }
  }
  
  renderStatisticsLayout();
  switchStatisticsSubTab(statisticsState.currentSubTab);
};

// Render Main Layout (Sidebar + Content Area)
function renderStatisticsLayout() {
  const container = document.getElementById('statisticsTab');
  const isTeacher = window.currentUser && window.currentUser.role === 'teacher';
  
  let tabsHtml = `
    <button class="course-sub-tab ${statisticsState.currentSubTab === 'student-scores' ? 'active' : ''}" 
            onclick="switchStatisticsSubTab('student-scores')">🏆 Student Scores</button>
  `;
  
  if (!isTeacher) {
      tabsHtml += `
        <button class="course-sub-tab ${statisticsState.currentSubTab === 'org-overview' ? 'active' : ''}" 
                onclick="switchStatisticsSubTab('org-overview')">🏢 Org Overview</button>
        <button class="course-sub-tab ${statisticsState.currentSubTab === 'teacher-analysis' ? 'active' : ''}" 
                onclick="switchStatisticsSubTab('teacher-analysis')">👨‍🏫 Teacher Analysis</button>
        <button class="course-sub-tab ${statisticsState.currentSubTab === 'student-analysis' ? 'active' : ''}" 
                onclick="switchStatisticsSubTab('student-analysis')">🎓 Student Analysis</button>
      `;
  }
  
  container.innerHTML = `
    <div class="course-management">
      <!-- Sub-tabs Sidebar -->
      <div class="course-sub-tabs">
        ${tabsHtml}
      </div>
      
      <!-- Content Area -->
      <div class="course-management-content" id="statisticsContent">
        <!-- Content will be injected here -->
      </div>
    </div>
  `;
}

// Switch Sub-tab
window.switchStatisticsSubTab = function(tabName) {
  statisticsState.currentSubTab = tabName;
  
  // Update Sidebar Active State manually to avoid full re-render if possible, 
  // but renderStatisticsLayout is cheap.
  renderStatisticsLayout(); 
  
  const contentContainer = document.getElementById('statisticsContent');
  
  switch(tabName) {
    case 'student-scores':
      renderStudentScoresUI(contentContainer);
      break;
    case 'org-overview':
    case 'teacher-analysis':
    case 'student-analysis':
      contentContainer.innerHTML = `
        <div class="empty-state" style="padding: 40px; text-align: center; color: #666;">
          <div style="font-size: 48px; margin-bottom: 20px;">📊</div>
          <h3>${formatTabName(tabName)}</h3>
          <p>This feature is under development.</p>
        </div>
      `;
      break;
  }
};

function formatTabName(name) {
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// ==================== Student Scores Logic ====================

async function renderStudentScoresUI(container) {
  const isTeacher = window.currentUser && window.currentUser.role === 'teacher';
  
  // If teacher, force 'all' or 'teacher' logic? 
  // User said: "By teacher (only see that teacher's own students)"
  // If viewMode is teacher, we should lock selectedTeacherId to currentUser.id
  
  let teacherSelectHtml = '';
  if (isTeacher) {
      // For teacher, if viewMode is teacher, we just show "My Students" label or a disabled select
      teacherSelectHtml = `
        <div class="control-group" id="statsTeacherGroup" style="display: ${statisticsState.studentScores.viewMode === 'teacher' ? 'block' : 'none'}">
          <label>Teacher:</label>
          <span style="font-weight:bold; padding: 5px 10px; background: #f3f4f6; border-radius: 4px;">${escapeHtml(window.currentUser.name)} (Me)</span>
          <!-- Hidden value for logic -->
          <input type="hidden" id="statsTeacherSelect" value="${window.currentUser.id}">
        </div>
      `;
  } else {
      // For Admin/Org
      teacherSelectHtml = `
        <div class="control-group" id="statsTeacherGroup" style="display: ${statisticsState.studentScores.viewMode === 'teacher' ? 'block' : 'none'}">
          <label>Teacher:</label>
          <select id="statsTeacherSelect" onchange="handleStatsFilterChange()">
            <option value="all">Select Teacher...</option>
            <!-- Teachers populated dynamically -->
          </select>
        </div>
      `;
  }

  container.innerHTML = `
    <div class="statistics-header">
      <h2>Student Scores Leaderboard</h2>
      <div class="statistics-controls">
        
        <!-- View Mode -->
        <div class="control-group">
          <label>View:</label>
          <select id="statsViewMode" onchange="handleStatsFilterChange()">
            <option value="all" ${statisticsState.studentScores.viewMode === 'all' ? 'selected' : ''}>All Students</option>
            <option value="teacher" ${statisticsState.studentScores.viewMode === 'teacher' ? 'selected' : ''}>By Teacher</option>
          </select>
        </div>

        <!-- Teacher Selector -->
        ${teacherSelectHtml}

        <!-- Time Period -->
        <div class="control-group">
          <label>Period:</label>
          <div class="period-buttons">
            <button class="btn-period ${statisticsState.studentScores.timePeriod === 'all-time' ? 'active' : ''}" onclick="changeStatsPeriod('all-time')">All Time</button>
            <button class="btn-period ${statisticsState.studentScores.timePeriod === 'yearly' ? 'active' : ''}" onclick="changeStatsPeriod('yearly')">Yearly</button>
            <button class="btn-period ${statisticsState.studentScores.timePeriod === 'monthly' ? 'active' : ''}" onclick="changeStatsPeriod('monthly')">Monthly</button>
            <button class="btn-period ${statisticsState.studentScores.timePeriod === 'weekly' ? 'active' : ''}" onclick="changeStatsPeriod('weekly')">Weekly</button>
          </div>
        </div>

        <!-- Date Navigation (For Yearly/Monthly/Weekly) -->
        <div class="control-group" id="statsDateNav" style="display: ${statisticsState.studentScores.timePeriod === 'all-time' ? 'none' : 'flex'}; align-items: center; gap: 5px;">
           <button class="btn-nav" onclick="changeStatsDate(-1)">‹</button>
           <span id="statsDateLabel" style="font-weight: bold; min-width: 100px; text-align: center;">Current</span>
           <button class="btn-nav" onclick="changeStatsDate(1)">›</button>
        </div>

      </div>
    </div>
    
    <div class="statistics-table-container">
      <div class="loading-placeholder">Loading ranking data...</div>
    </div>
  `;

  // Populate Teachers (Only for Org)
  if (!isTeacher && statisticsState.studentScores.viewMode === 'teacher') {
      await populateStatsTeachers();
  }
  
  // Initialize Teacher ID if Teacher Role
  if (isTeacher && statisticsState.studentScores.viewMode === 'teacher') {
      statisticsState.studentScores.selectedTeacherId = window.currentUser.id;
  }
  
  // Inject CSS
  injectStatisticsStyles();

  // Load Data
  loadStudentScoresData();
}

function injectStatisticsStyles() {
    if (document.getElementById('statisticsStyles')) return;
    const style = document.createElement('style');
    style.id = 'statisticsStyles';
    style.textContent = `
        .statistics-header { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 20px; }
        .statistics-controls { display: flex; gap: 20px; flex-wrap: wrap; align-items: center; margin-top: 15px; }
        .control-group { display: flex; align-items: center; gap: 10px; }
        .control-group label { font-weight: 600; color: #555; }
        .period-buttons { display: flex; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }
        .btn-period { background: white; border: none; padding: 8px 16px; cursor: pointer; border-right: 1px solid #e0e0e0; transition: background 0.2s; }
        .btn-period:last-child { border-right: none; }
        .btn-period.active { background: #667eea; color: white; }
        .btn-period:hover:not(.active) { background: #f9fafb; }
        .btn-nav { padding: 5px 10px; border: 1px solid #e0e0e0; background: white; border-radius: 4px; cursor: pointer; }
        .btn-nav:hover { background: #f0f0f0; }
        
        .statistics-table-container { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .stats-table { width: 100%; border-collapse: collapse; }
        .stats-table th { background: #f8f9fa; padding: 12px 15px; text-align: left; border-bottom: 2px solid #e0e0e0; color: #555; }
        .stats-table td { padding: 12px 15px; border-bottom: 1px solid #eee; }
        .stats-table tr:last-child td { border-bottom: none; }
        .stats-table tr:hover { background: #f9fafb; }
        
        .rank-badge { display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; font-weight: bold; font-size: 12px; }
        .rank-1 { background: #fbbf24; color: white; }
        .rank-2 { background: #9ca3af; color: white; }
        .rank-3 { background: #b45309; color: white; }
        .rank-other { background: #f3f4f6; color: #666; }
        
        .score-value { font-weight: bold; color: #667eea; }
        .score-diff { font-size: 11px; color: #10b981; margin-left: 5px; }
    `;
    document.head.appendChild(style);
}

// Populate Teacher Dropdown
async function populateStatsTeachers() {
    const select = document.getElementById('statsTeacherSelect');
    if (!select) return;
    
    try {
        const response = await window.authUtils.authenticatedFetch('/organizations/teachers');
        if (response.ok) {
            const teachers = await response.json();
            select.innerHTML = '<option value="all">Select Teacher...</option>' + 
                teachers.map(t => `<option value="${t.id}" ${statisticsState.studentScores.selectedTeacherId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
        }
    } catch (e) {
        console.error('Error loading teachers for stats', e);
    }
}

// Handle Filter Changes
window.handleStatsFilterChange = function() {
    const viewMode = document.getElementById('statsViewMode').value;
    statisticsState.studentScores.viewMode = viewMode;
    const isTeacher = window.currentUser && window.currentUser.role === 'teacher';
    
    if (viewMode === 'teacher') {
        document.getElementById('statsTeacherGroup').style.display = 'block';
        
        if (isTeacher) {
            statisticsState.studentScores.selectedTeacherId = window.currentUser.id;
        } else {
            statisticsState.studentScores.selectedTeacherId = document.getElementById('statsTeacherSelect').value;
            if (document.getElementById('statsTeacherSelect').options.length <= 1) {
                populateStatsTeachers();
            }
        }
    } else {
        document.getElementById('statsTeacherGroup').style.display = 'none';
        statisticsState.studentScores.selectedTeacherId = 'all';
    }
    
    updateStatsDateLabel();
    loadStudentScoresData();
};

window.changeStatsPeriod = function(period) {
    statisticsState.studentScores.timePeriod = period;
    statisticsState.studentScores.currentDate = new Date(); // Reset date
    
    renderStudentScoresUI(document.getElementById('statisticsContent')); // Re-render to update UI state
};

window.changeStatsDate = function(delta) {
    const date = statisticsState.studentScores.currentDate;
    const period = statisticsState.studentScores.timePeriod;
    
    if (period === 'yearly') {
        date.setFullYear(date.getFullYear() + delta);
    } else if (period === 'monthly') {
        date.setMonth(date.getMonth() + delta);
    } else if (period === 'weekly') {
        date.setDate(date.getDate() + (delta * 7));
    }
    
    statisticsState.studentScores.currentDate = date;
    updateStatsDateLabel();
    loadStudentScoresData();
};

function updateStatsDateLabel() {
    const label = document.getElementById('statsDateLabel');
    const nav = document.getElementById('statsDateNav');
    const period = statisticsState.studentScores.timePeriod;
    const date = statisticsState.studentScores.currentDate;
    
    if (period === 'all-time') {
        nav.style.display = 'none';
        return;
    }
    
    nav.style.display = 'flex';
    
    if (period === 'yearly') {
        label.textContent = date.getFullYear();
    } else if (period === 'monthly') {
        label.textContent = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (period === 'weekly') {
        // Show start of week
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Mon
        const monday = new Date(d.setDate(diff));
        const sunday = new Date(new Date(monday).setDate(monday.getDate() + 6));
        label.textContent = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
}

// Load and Render Data
async function loadStudentScoresData() {
    const container = document.querySelector('.statistics-table-container');
    container.innerHTML = '<div class="loading-placeholder">Loading ranking data...</div>';
    
    try {
        const response = await window.authUtils.authenticatedFetch('/students');
        if (!response.ok) throw new Error('Failed to load students');
        let students = await response.json();
        
        // 1. Filter by Teacher
        if (statisticsState.studentScores.viewMode === 'teacher') {
            const teacherId = statisticsState.studentScores.selectedTeacherId;
            if (teacherId && teacherId !== 'all') {
                // Get Teacher's Assigned Students
                // We need to fetch teachers to check assignments, or filter if student object has info
                // Currently student object doesn't have teacher info directly.
                // Fetch teachers to get assignment list.
                
                const tResponse = await window.authUtils.authenticatedFetch('/organizations/teachers');
                const teachers = await tResponse.json();
                const teacher = teachers.find(t => t.id === teacherId);
                
                if (teacher && teacher.assignedStudents) {
                    students = students.filter(s => teacher.assignedStudents.includes(s.id));
                } else {
                    students = []; // No students or invalid teacher
                }
            }
        }
        
        // 2. Calculate Score based on Period
        const period = statisticsState.studentScores.timePeriod;
        const date = statisticsState.studentScores.currentDate;
        
        const scoredStudents = students.map(s => {
            let score = 0;
            let stats = s.stats || {};
            
            if (period === 'all-time') {
                score = s.score || 0;
            } else if (period === 'yearly') {
                const key = date.getFullYear().toString();
                if (stats.yearly && stats.yearly[key]) score = stats.yearly[key].totalPoints;
            } else if (period === 'monthly') {
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (stats.monthly && stats.monthly[key]) score = stats.monthly[key].totalPoints;
            } else if (period === 'weekly') {
                // Get Week Key logic from server
                const d = new Date(date);
                const year = d.getFullYear();
                const dayOfWeek = d.getDay();
                const daysToMonday = dayOfWeek === 0 ? -6 : (dayOfWeek === 1 ? 0 : 1 - dayOfWeek);
                const mondayDate = new Date(d);
                mondayDate.setDate(d.getDate() + daysToMonday);
                
                const jan1 = new Date(year, 0, 1);
                const jan1Day = jan1.getDay();
                const daysToFirstMonday = jan1Day === 0 ? 1 : (jan1Day === 1 ? 0 : 8 - jan1Day);
                const firstMonday = new Date(year, 0, 1 + daysToFirstMonday);
                
                const daysDiff = Math.floor((mondayDate - firstMonday) / (24 * 60 * 60 * 1000));
                let weekNum = Math.floor(daysDiff / 7) + 1;
                if (weekNum < 1) weekNum = 1; 
                
                const key = `${year}-W${String(weekNum).padStart(2, '0')}`;
                if (stats.weekly && stats.weekly[key]) score = stats.weekly[key].totalPoints;
            }
            
            return { ...s, displayScore: score };
        });
        
        // 3. Sort
        scoredStudents.sort((a, b) => b.displayScore - a.displayScore);
        
        // 4. Render Table
        renderLeaderboardTable(container, scoredStudents);
        updateStatsDateLabel(); 
        
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="error-message">Failed to load data</div>';
    }
}

function renderLeaderboardTable(container, students) {
    if (students.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;color:#999;">No data available for this period/selection.</div>';
        return;
    }
    
    let html = `
      <table class="stats-table">
        <thead>
          <tr>
            <th width="80">Rank</th>
            <th>Student Name</th>
            <th>chess.com ID</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    students.forEach((s, index) => {
        const rank = index + 1;
        let rankClass = 'rank-other';
        if (rank === 1) rankClass = 'rank-1';
        if (rank === 2) rankClass = 'rank-2';
        if (rank === 3) rankClass = 'rank-3';
        
        html += `
          <tr>
            <td><span class="rank-badge ${rankClass}">${rank}</span></td>
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.chessComId || '')}</td>
            <td><span class="score-value">${s.displayScore}</span></td>
          </tr>
        `;
    });
    
    html += `</tbody></table>`;
    container.innerHTML = html;
}

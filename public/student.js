const urlParams = new URLSearchParams(window.location.search);
const studentId = urlParams.get('id');
let studentData = null;

// Initialize
if (studentId) {
    loadData();
} else {
    document.body.innerHTML = '<h2 style="text-align:center; margin-top:50px; color:white;">Invalid Link</h2>';
}

// Load Data
async function loadData(password = '') {
    try {
        const url = `/api/public/students/${studentId}${password ? '?password=' + encodeURIComponent(password) : ''}`;
        const response = await fetch(url);
        
        if (response.status === 404) {
            document.body.innerHTML = '<h2 style="text-align:center; margin-top:50px; color:white;">Student Not Found</h2>';
            return;
        }
        
        const data = await response.json();
        
        if (data.protected) {
            document.getElementById('passwordGate').style.display = 'block';
            document.getElementById('studentDashboard').style.display = 'none';
            // Don't show name if protected? Or show "Protected Profile"?
            // API returns basic name if protected.
            return;
        }
        
        if (data.error) {
            document.getElementById('authError').textContent = data.error;
            document.getElementById('authError').style.display = 'block';
            return;
        }
        
        studentData = data;
        renderDashboard();
        
    } catch (e) {
        console.error(e);
        document.body.innerHTML = '<h2 style="text-align:center; margin-top:50px; color:white;">Error loading profile</h2>';
    }
}

function checkPassword() {
    const pwd = document.getElementById('accessPasswordInput').value;
    loadData(pwd);
}

function renderDashboard() {
    document.getElementById('passwordGate').style.display = 'none';
    document.getElementById('studentDashboard').style.display = 'flex';
    
    const s = studentData;
    document.getElementById('sName').textContent = s.name;
    document.getElementById('sId').textContent = `ID: ${s.studentId}`;
    document.getElementById('sAvatar').textContent = s.name.charAt(0).toUpperCase();
    
    document.getElementById('sScore').textContent = s.score || 0;
    document.getElementById('sLevel').textContent = s.level || 1;
    document.getElementById('sAnswers').textContent = s.answerCount || 0;
    
    // Balance might not be in public API unless I add it. 
    // I didn't add it explicitly in server.js publicData object.
    // Let's check if it defaults to 0 or undefined.
    if (s.balance !== undefined) {
        document.getElementById('sBalance').textContent = `$${parseFloat(s.balance).toFixed(2)}`;
    } else {
        // Hide balance card if not available
        document.getElementById('sBalance').parentElement.style.display = 'none';
    }
    
    // Rank Badge
    const rankColors = {
        'Wood': '#8B4513', 'Bronze': '#CD7F32', 'Silver': '#C0C0C0', 'Gold': '#FFD700',
        'Platinum': '#E5E4E2', 'Diamond': '#00CED1', 'Candidate Master': '#9370DB',
        'Master': '#FF1493', 'International Master': '#FF4500', 'Grand Master': '#FF0000'
    };
    
    const badge = document.createElement('div');
    badge.className = 'rank-badge';
    badge.style.backgroundColor = rankColors[s.rank] || '#666';
    badge.textContent = s.rank;
    document.getElementById('sRankBadge').innerHTML = '';
    document.getElementById('sRankBadge').appendChild(badge);

    // Progress
    document.getElementById('sRank').textContent = s.rank;
    document.getElementById('sNextRank').textContent = s.nextRank || 'Max';
    document.getElementById('sProgress').style.width = `${s.progress}%`;
    
    if (s.nextRank) {
        document.getElementById('sScoreToNext').textContent = s.scoreToNext || 0;
    } else {
        document.getElementById('sScoreToNext').parentElement.style.display = 'none';
    }
}

window.switchTab = function(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    // Find the button that was clicked
    // event.target might be the button or child
    // Simple way: assume 2 tabs, toggle logic
    const buttons = document.querySelectorAll('.tab');
    if (tab === 'home') buttons[0].classList.add('active');
    if (tab === 'stats') buttons[1].classList.add('active');
    
    document.getElementById(`${tab}Tab`).classList.add('active');
};

// Allow Enter key for password
document.getElementById('accessPasswordInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') checkPassword();
});

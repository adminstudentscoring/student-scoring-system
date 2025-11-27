// Page Components for Puzzle Monster Fight

const HomePage = (() => {
  function render() {
    return `
      <div class="page-content">
        <h1 class="page-title">Home</h1>
        <div class="home-content">
          <div class="mode-cards">
            <div class="mode-card" data-mode="story">
              <h2>Story Mode</h2>
              <p>Embark on an epic adventure through the puzzle world</p>
            </div>
            <div class="mode-card" data-mode="challenge">
              <h2>Challenge Mode</h2>
              <p>Test your skills with challenging puzzles</p>
            </div>
            <div class="mode-card" data-mode="practice">
              <h2>Practice Mode</h2>
              <p>Practice and improve your puzzle-solving skills</p>
            </div>
          </div>
          <div class="rules-section">
            <button class="rules-toggle" id="rulesToggle">
              <span>Game Rules</span>
              <span class="rules-arrow">▼</span>
            </button>
            <div class="rules-content" id="rulesContent">
              <div class="rule-item">
                <h3>Game Objective</h3>
                <p>Consume jewels by moving the knight in L-shaped patterns. Create matches of three or more identical elements to trigger cascades and score points.</p>
              </div>
              <div class="rule-item">
                <h3>Knight Movement Rules</h3>
                <p>The knight moves in an L-shape pattern: two squares in one direction, then one square perpendicular. You can move to any valid L-shaped position from your current location.</p>
              </div>
              <div class="rule-item">
                <h3>Jewel Consumption</h3>
                <p>When you move the knight to a jewel position, that jewel is consumed. The knight then moves to that position, and new valid moves are highlighted.</p>
              </div>
              <div class="rule-item">
                <h3>Match and Cascade Rules</h3>
                <p>When three or more identical elements align horizontally or vertically, they are automatically removed. This triggers a cascade effect where jewels fall down to fill empty spaces, potentially creating new matches.</p>
              </div>
              <div class="rule-item">
                <h3>Timer Rules</h3>
                <p>Each turn has a time limit of 20 seconds. You must consume as many jewels as possible within this time. When time runs out, your turn ends automatically.</p>
              </div>
              <div class="rule-item">
                <h3>Scoring System</h3>
                <p>Points are awarded for each jewel consumed. Cascades provide bonus points. The more jewels you consume in a single turn and the more cascades you trigger, the higher your score.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function init() {
    // Mode card click handlers
    const modeCards = document.querySelectorAll('.mode-card');
    modeCards.forEach(card => {
      card.addEventListener('click', () => {
        const mode = card.dataset.mode;
        Router.goTo(`/${mode}`);
      });
    });

    // Rules toggle handler
    const rulesToggle = document.getElementById('rulesToggle');
    const rulesContent = document.getElementById('rulesContent');
    
    if (rulesToggle && rulesContent) {
      rulesToggle.addEventListener('click', () => {
        const isExpanded = rulesContent.classList.contains('expanded');
        
        if (isExpanded) {
          rulesContent.classList.remove('expanded');
          rulesToggle.querySelector('.rules-arrow').textContent = '▼';
        } else {
          rulesContent.classList.add('expanded');
          rulesToggle.querySelector('.rules-arrow').textContent = '▲';
        }
      });
    }
  }

  return {
    render,
    init
  };
})();

const PracticePage = (() => {
  function render() {
    return `
      <div class="page-content">
        <div class="practice-header">
          <button class="back-button" id="backButton">←</button>
          <h1 class="page-title">Practice Mode</h1>
        </div>
        <div id="puzzleMonsterFightGame" class="puzzle-monster-root">
          <div class="pmf-loading">
            <p>Loading game...</p>
          </div>
        </div>
      </div>
    `;
  }

  function init() {
    // Back button handler
    const backButton = document.getElementById('backButton');
    if (backButton) {
      backButton.addEventListener('click', () => {
        Router.goTo('/home');
      });
    }

    // Initialize game
    const container = document.getElementById('puzzleMonsterFightGame');
    if (container && typeof PuzzleMonsterFight !== 'undefined' && PuzzleMonsterFight.init) {
      PuzzleMonsterFight.init();
    } else if (container && typeof initPuzzleMonsterFight === 'function') {
      initPuzzleMonsterFight();
    } else {
      console.error('Game initialization function not found');
      if (container) {
        container.innerHTML = '<div class="pmf-error">Unable to load game logic</div>';
      }
    }
  }

  return {
    render,
    init
  };
})();

const StoryPage = (() => {
  function render() {
    return `
      <div class="page-content">
        <h1 class="page-title">Story Mode</h1>
        <div class="empty-page">
          <p>Story Mode coming soon...</p>
        </div>
      </div>
    `;
  }

  return {
    render
  };
})();

const ChallengePage = (() => {
  function render() {
    return `
      <div class="page-content">
        <h1 class="page-title">Challenge Mode</h1>
        <div class="empty-page">
          <p>Challenge Mode coming soon...</p>
        </div>
      </div>
    `;
  }

  return {
    render
  };
})();

const BackpackPage = (() => {
  function render() {
    return `
      <div class="page-content">
        <h1 class="page-title">Backpack</h1>
        <div class="empty-page">
          <p>Backpack coming soon...</p>
        </div>
      </div>
    `;
  }

  return {
    render
  };
})();

const PetsPage = (() => {
  function render() {
    return `
      <div class="page-content">
        <h1 class="page-title">Pets</h1>
        <div class="empty-page">
          <p>Pets coming soon...</p>
        </div>
      </div>
    `;
  }

  return {
    render
  };
})();

const ShopPage = (() => {
  function render() {
    return `
      <div class="page-content">
        <h1 class="page-title">Shop</h1>
        <div class="empty-page">
          <p>Shop coming soon...</p>
        </div>
      </div>
    `;
  }

  return {
    render
  };
})();

const SettingsPage = (() => {
  function render() {
    return `
      <div class="page-content">
        <h1 class="page-title">Settings</h1>
        <div class="empty-page">
          <p>Settings coming soon...</p>
        </div>
      </div>
    `;
  }

  return {
    render
  };
})();

const ItemListPage = (() => {
  function render() {
    return `
      <div class="page-content">
        <h1 class="page-title">Item List</h1>
        <div class="empty-page">
          <p>Item List coming soon...</p>
        </div>
      </div>
    `;
  }

  return {
    render
  };
})();

const PetListPage = (() => {
  function render() {
    return `
      <div class="page-content pet-list-page">
        <h1 class="page-title">Pet List</h1>
        <div class="pet-list-controls">
          <div class="search-box">
            <input type="text" id="petSearchInput" class="search-input" placeholder="Search by name...">
          </div>
          <div class="filter-controls">
            <div class="filter-group">
              <label>Element</label>
              <div class="filter-dropdown" id="elementFilter">
                <button class="filter-button">Select Elements</button>
                <div class="filter-options">
                  <label><input type="checkbox" value="fire"> Fire</label>
                  <label><input type="checkbox" value="water"> Water</label>
                  <label><input type="checkbox" value="light"> Light</label>
                  <label><input type="checkbox" value="dark"> Dark</label>
                  <label><input type="checkbox" value="wind"> Wind</label>
                </div>
              </div>
            </div>
            <div class="filter-group">
              <label>Race</label>
              <div class="filter-dropdown" id="raceFilter">
                <button class="filter-button">Select Races</button>
                <div class="filter-options"></div>
              </div>
            </div>
            <div class="filter-group">
              <label>Tier</label>
              <div class="filter-dropdown" id="tierFilter">
                <button class="filter-button">Select Tiers</button>
                <div class="filter-options">
                  <label><input type="checkbox" value="C"> C (Low)</label>
                  <label><input type="checkbox" value="B"> B (Mid)</label>
                  <label><input type="checkbox" value="A"> A (High)</label>
                </div>
              </div>
            </div>
            <button class="clear-filters-btn" id="clearFiltersBtn">Clear All</button>
          </div>
        </div>
        <div class="pet-list-container" id="petListContainer">
          <div class="pet-list-grid" id="petListGrid"></div>
          <div class="loading-indicator" id="loadingIndicator">Loading...</div>
        </div>
      </div>
    `;
  }

  function init() {
    // Load pets data
    if (typeof PetsData !== 'undefined' && PetsData.length > 0) {
      PetListPage.setupFilters();
      PetListPage.setupSearch();
      PetListPage.setupVirtualScroll();
      PetListPage.applyFilters();
    } else {
      // Load pets data from file
      const script = document.createElement('script');
      script.src = 'pets-data.js';
      script.onload = () => {
        PetListPage.setupFilters();
        PetListPage.setupSearch();
        PetListPage.setupVirtualScroll();
        PetListPage.applyFilters();
      };
      document.head.appendChild(script);
    }
  }

  function setupFilters() {
    // Setup race filter options
    const races = [...new Set(PetsData.map(pet => pet.race))].sort();
    const raceFilterOptions = document.querySelector('#raceFilter .filter-options');
    if (raceFilterOptions) {
      raceFilterOptions.innerHTML = races.map(race => 
        `<label><input type="checkbox" value="${race}"> ${race}</label>`
      ).join('');
    }

    // Setup filter dropdowns
    document.querySelectorAll('.filter-dropdown').forEach(dropdown => {
      const button = dropdown.querySelector('.filter-button');
      const options = dropdown.querySelector('.filter-options');
      
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', () => {
        dropdown.classList.remove('active');
      });

      // Prevent closing when clicking inside
      options.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    // Setup filter change handlers
    document.querySelectorAll('.filter-options input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        PetListPage.applyFilters();
      });
    });

    // Setup clear filters button
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        document.querySelectorAll('.filter-options input[type="checkbox"]').forEach(cb => {
          cb.checked = false;
        });
        PetListPage.applyFilters();
      });
    }
  }

  function setupSearch() {
    const searchInput = document.getElementById('petSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        PetListPage.applyFilters();
      });
    }
  }

  let filteredPets = [];
  let visibleStart = 0;
  let visibleEnd = 0;
  const itemsPerPage = 20;
  const bufferSize = 10;

  function applyFilters() {
    const searchTerm = (document.getElementById('petSearchInput')?.value || '').toLowerCase();
    const selectedElements = Array.from(document.querySelectorAll('#elementFilter input:checked')).map(cb => cb.value);
    const selectedRaces = Array.from(document.querySelectorAll('#raceFilter input:checked')).map(cb => cb.value);
    const selectedTiers = Array.from(document.querySelectorAll('#tierFilter input:checked')).map(cb => cb.value);

    filteredPets = PetsData.filter(pet => {
      // Search filter
      if (searchTerm && !pet.name.toLowerCase().includes(searchTerm)) {
        return false;
      }

      // Element filter
      if (selectedElements.length > 0 && !selectedElements.includes(pet.element)) {
        return false;
      }

      // Race filter
      if (selectedRaces.length > 0 && !selectedRaces.includes(pet.race)) {
        return false;
      }

      // Tier filter
      if (selectedTiers.length > 0 && !selectedTiers.includes(pet.tier)) {
        return false;
      }

      return true;
    });

    visibleStart = 0;
    PetListPage.renderPets();
  }

  function setupVirtualScroll() {
    const container = document.getElementById('petListContainer');
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const itemHeight = 400;
      const cardsPerRow = window.innerWidth > 1024 ? 5 : window.innerWidth > 768 ? 4 : 3;
      const rowHeight = itemHeight;
      
      const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - bufferSize);
      const endRow = Math.min(
        Math.ceil(filteredPets.length / cardsPerRow),
        startRow + Math.ceil(containerHeight / rowHeight) + bufferSize * 2
      );
      
      const newStart = startRow * cardsPerRow;
      const newEnd = Math.min(filteredPets.length, endRow * cardsPerRow);

      if (newStart !== visibleStart || newEnd !== visibleEnd) {
        visibleStart = newStart;
        visibleEnd = newEnd;
        PetListPage.renderPets();
      }
    };

    container.addEventListener('scroll', handleScroll);
    // Initial render
    handleScroll();
  }

  function renderPets() {
    const grid = document.getElementById('petListGrid');
    if (!grid) return;

    const visiblePets = filteredPets.slice(visibleStart, visibleEnd);
    
    // Calculate rows and columns
    const cardsPerRow = window.innerWidth > 1024 ? 5 : window.innerWidth > 768 ? 4 : 3;
    const itemHeight = 400;
    const totalRows = Math.ceil(filteredPets.length / cardsPerRow);
    const startRow = Math.floor(visibleStart / cardsPerRow);
    const endRow = Math.ceil(visibleEnd / cardsPerRow);
    
    grid.innerHTML = visiblePets.map((pet, index) => {
      const actualIndex = visibleStart + index;
      return PetListPage.renderPetCard(pet, actualIndex);
    }).join('');

    // Update container height for virtual scroll
    grid.style.height = `${totalRows * itemHeight}px`;
    grid.style.paddingTop = `${startRow * itemHeight}px`;

    // Show loading indicator if needed
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = visibleEnd < filteredPets.length ? 'block' : 'none';
    }
  }

  function renderPetCard(pet, index) {
    const elementColors = {
      fire: '#ff4444',
      water: '#4488ff',
      light: '#ffd700',
      dark: '#9966cc',
      wind: '#44ff44'
    };

    const elementColor = elementColors[pet.element] || '#888';

    return `
      <div class="pet-card" data-index="${index}" style="opacity: 0; animation: fadeIn 0.3s ease-in forwards;">
        <div class="pet-card-header">
          <div class="pet-emoji">${pet.emoji}</div>
          <div class="pet-name">${pet.name}</div>
          <div class="pet-element-badge" style="background: ${elementColor}"></div>
        </div>
        <div class="pet-card-body">
          <div class="pet-info-row">
            <span class="pet-race">${pet.race}</span>
            <span class="pet-tier tier-${pet.tier}">${pet.tier}</span>
          </div>
          <div class="pet-level">1/99 lv</div>
          <div class="pet-stats">
            <div class="pet-stat">
              <span class="stat-label">HP:</span>
              <span class="stat-value">${pet.baseHP}</span>
            </div>
            <div class="pet-stat">
              <span class="stat-label">ATK:</span>
              <span class="stat-value">${pet.baseAttack}</span>
            </div>
            <div class="pet-stat">
              <span class="stat-label">RCV:</span>
              <span class="stat-value">${pet.baseRecovery}</span>
            </div>
          </div>
          <div class="pet-skill">
            <div class="skill-name">${pet.skill.name}</div>
            <div class="skill-description">${pet.skill.description}</div>
            <div class="skill-cooldown">CD: ${pet.skill.cooldown}</div>
          </div>
          ${pet.leaderSkill ? `
            <div class="pet-leader-skill">
              <div class="leader-skill-name">${pet.leaderSkill.name}</div>
              <div class="leader-skill-description">${pet.leaderSkill.description}</div>
            </div>
          ` : ''}
          <div class="pet-description">${pet.description}</div>
        </div>
      </div>
    `;
  }

  return {
    render,
    init,
    setupFilters,
    setupSearch,
    setupVirtualScroll,
    applyFilters,
    renderPets,
    renderPetCard
  };
})();


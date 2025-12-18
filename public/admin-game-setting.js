// Admin - Game Setting (placeholder)
// All UI text is in English by design.

(function () {
  function hideAllPanels(panelMap) {
    Object.values(panelMap).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  // Expose for inline onclick in admin.html (keeps HTML changes minimal)
  window.switchAdminGameSettingSideTab = function switchAdminGameSettingSideTab(tab, element) {
    document.querySelectorAll('.admin-game-setting-side-tab').forEach((t) => t.classList.remove('active'));
    if (element) element.classList.add('active');

    const panelMap = {
      runningQueen: 'adminGameSettingRunningQueenPanel',
      royalExchange: 'adminGameSettingRoyalExchangePanel',
      monsterFight: 'adminGameSettingMonsterFightPanel',
      puzzleMonsterFight: 'adminGameSettingPuzzleMonsterFightPanel',
      chessCom: 'adminGameSettingChessComPanel',
      noBlunder: 'adminGameSettingNoBlunderPanel'
    };

    hideAllPanels(panelMap);

    const targetId = panelMap[String(tab)] || null;
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) el.classList.remove('hidden');
    }
  };
})();



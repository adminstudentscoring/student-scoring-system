(function () {
  'use strict';

  function AchievementPage() {}
  AchievementPage.title = 'Achievement';
  AchievementPage.render = () => `
    <div class="cp-page-card">
      <div class="cp-h1">Achievement</div>
      <div class="cp-muted" style="margin-top:8px;">Coming soon.</div>
    </div>
  `;
  AchievementPage.init = () => {};

  window.ChessPalAchievement = {
    AchievementPage
  };
})();

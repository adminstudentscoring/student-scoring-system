                <input id="blBoardLightInput" type="color" value="${escapeHtml(light)}" />
              </div>
              <div class="bl-settings-row">
                <label for="blBoardDarkInput">Dark squares</label>
                <input id="blBoardDarkInput" type="color" value="${escapeHtml(dark)}" />
              </div>
              <div class="bl-settings-row">
                <button id="blBoardResetBtn" class="btn btn-secondary" type="button">Reset</button>
              </div>
            </div>
            <div style="margin-top:12px;">
              <div class="blunders-muted" style="margin-bottom:8px;">Preview</div>
              ${renderBoardPreview(light, dark)}
            </div>
          </div>
        ` : `
          <div class="bl-settings-panel" role="tabpanel" aria-label="General">
            <div class="blunders-muted">To be developed.</div>
          </div>
        `}
      </div>
    `;
  }

  window.BlundersStudent = {
    renderSidebar,
    renderDebugBlock,
    openHomePracticeModal,
    startPracticeFromHome,
    renderHomePage,
    renderBlunderPage,
    renderReviewPage,
    // Review (bucketed paging)
    reviewToggleBucket,
    reviewPrev,
    reviewNext,
    reviewGo,
    reviewSetJump,
    reviewSetTheme,
    resetReviewUi,
    renderStudentMasterGamePage,
    renderSettingsPage
  };
})();




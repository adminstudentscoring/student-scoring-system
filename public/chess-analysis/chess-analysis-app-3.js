import {
  Chess, state, EMPTY_FEN, START_FEN
} from './chess-analysis-app-shared.js';
import {
  toast, renderBoard, renderMoveList, updateNamesUi, showAnalysisPanel, showSetupPanel,
  showTab, loadMainFromPgn, loadMainFromFen, applyMainFromEditor, loadEditorFromFen,
  refreshCastlingFromBoard, mergeCastlingFromUi, syncFenFieldFromEditor, initEditor
} from './chess-analysis-app-1.js';
import {
  buildPgnExport, saveToStorage, loadSavedList, positionPopover, closePopovers, wirePalette
} from './chess-analysis-app-2.js';

export function wireEvents() {
  document.getElementById('btnOpenWorkspace').addEventListener('click', () => {
    document.getElementById('viewHub').hidden = true;
    document.getElementById('viewWorkspace').hidden = false;
    showAnalysisPanel();
    renderBoard();
    renderMoveList();
  });

  document.getElementById('btnBackHub').addEventListener('click', () => {
    document.getElementById('viewWorkspace').hidden = true;
    document.getElementById('viewHub').hidden = false;
    closePopovers();
  });

  document.querySelectorAll('.ca-tab').forEach((tab) => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });

  document.getElementById('btnFirst').addEventListener('click', () => {
    state.moveIndex = 0;
    renderBoard();
    renderMoveList();
  });
  document.getElementById('btnPrev').addEventListener('click', () => {
    state.moveIndex = Math.max(0, state.moveIndex - 1);
    renderBoard();
    renderMoveList();
  });
  document.getElementById('btnNext').addEventListener('click', () => {
    state.moveIndex = Math.min(state.moves.length, state.moveIndex + 1);
    renderBoard();
    renderMoveList();
  });
  document.getElementById('btnLast').addEventListener('click', () => {
    state.moveIndex = state.moves.length;
    renderBoard();
    renderMoveList();
  });

  document.getElementById('btnNew').addEventListener('click', () => {
    state.startFen = START_FEN;
    state.moves = [];
    state.moveIndex = 0;
    state.currentPgn = '';
    state.positionLabel = 'Starting position';
    document.getElementById('caPositionLabel').textContent = state.positionLabel;
    document.getElementById('caSetupPgn').value = '';
    renderMoveList();
    renderBoard();
    toast('New board');
  });

  document.getElementById('btnSave').addEventListener('click', saveToStorage);

  document.getElementById('btnEditNames').addEventListener('click', () => {
    document.getElementById('inputWhiteName').value = state.whiteName;
    document.getElementById('inputBlackName').value = state.blackName;
    document.getElementById('modalNames').hidden = false;
  });

  document.getElementById('btnNamesSave').addEventListener('click', () => {
    state.whiteName = document.getElementById('inputWhiteName').value.trim() || 'White';
    state.blackName = document.getElementById('inputBlackName').value.trim() || 'Black';
    updateNamesUi();
    document.getElementById('modalNames').hidden = true;
  });

  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => {
      el.closest('.ca-modal').hidden = true;
    });
  });

  document.getElementById('btnBoardGear').addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = document.getElementById('popoverBoard');
    const willOpen = pop.hidden;
    closePopovers();
    pop.hidden = !willOpen;
    if (!pop.hidden) positionPopover(pop, e.currentTarget);
    document.getElementById('popBoardCoords').checked = state.coordsVisible;
  });

  document.getElementById('popBoardFlip').addEventListener('click', () => {
    state.flipped = !state.flipped;
    renderBoard();
  });

  document.getElementById('popBoardCoords').addEventListener('change', (e) => {
    state.coordsVisible = e.target.checked;
    renderBoard();
  });

  document.getElementById('btnMenuEngine').addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = document.getElementById('popoverEngine');
    const open = pop.hidden;
    closePopovers();
    pop.hidden = !open;
    if (!pop.hidden) positionPopover(pop, e.currentTarget);
  });

  document.getElementById('btnMenuBottom').addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = document.getElementById('popoverBottom');
    const open = pop.hidden;
    closePopovers();
    pop.hidden = !open;
    if (!pop.hidden) positionPopover(pop, e.currentTarget);
  });

  document.getElementById('popEditPosition').addEventListener('click', () => {
    closePopovers();
    showSetupPanel();
  });

  document.getElementById('popSavedAnalysis').addEventListener('click', () => {
    closePopovers();
    loadSavedList();
    document.getElementById('modalSaved').hidden = false;
  });

  document.getElementById('popShare').addEventListener('click', async () => {
    closePopovers();
    const text = buildPgnExport();
    try {
      await navigator.clipboard.writeText(text);
      toast('PGN copied to clipboard');
    } catch {
      toast('Could not copy — select PGN from Save export manually');
    }
  });

  document.getElementById('btnSetupFlip').addEventListener('click', () => {
    state.flipped = !state.flipped;
    renderBoard();
  });

  document.getElementById('btnSetupReset').addEventListener('click', () => {
    state.editorChess = new Chess();
    state.editorChess.reset();
    refreshCastlingFromBoard();
    document.getElementById('caSetupTurn').value = 'w';
    syncFenFieldFromEditor();
    renderBoard();
  });

  document.getElementById('btnSetupClear').addEventListener('click', () => {
    state.editorChess = new Chess(EMPTY_FEN, { skipValidation: true });
    document.getElementById('caSetupTurn').value = 'w';
    document.getElementById('cwK').checked = false;
    document.getElementById('cwQ').checked = false;
    document.getElementById('cbK').checked = false;
    document.getElementById('cbQ').checked = false;
    syncFenFieldFromEditor();
    renderBoard();
  });

  ['cwK', 'cwQ', 'cbK', 'cbQ'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      if (!state.editorChess) return;
      const merged = mergeCastlingFromUi(state.editorChess.fen());
      try {
        state.editorChess.load(merged);
      } catch {
        toast('Invalid castling for this position');
      }
      syncFenFieldFromEditor();
    });
  });

  document.getElementById('caSetupTurn').addEventListener('change', () => {
    syncFenFieldFromEditor();
    const fen = document.getElementById('caSetupFen').value.trim();
    if (fen) loadEditorFromFen(fen);
    renderBoard();
  });

  document.getElementById('btnSetupLoad').addEventListener('click', () => {
    const pgn = document.getElementById('caSetupPgn').value.trim();
    if (pgn) {
      loadMainFromPgn(pgn);
      showAnalysisPanel();
      document.getElementById('caSetupPgn').value = pgn;
    } else {
      const fen = document.getElementById('caSetupFen').value.trim();
      if (fen) {
        loadMainFromFen(fen);
        showAnalysisPanel();
      }
    }
  });

  document.getElementById('btnSetupApply').addEventListener('click', applyMainFromEditor);

  document.addEventListener('click', () => closePopovers());

  document.querySelectorAll('.ca-popover').forEach((pop) => {
    pop.addEventListener('click', (e) => e.stopPropagation());
  });

  window.addEventListener('resize', () => renderBoard());
}

export function init() {
  wirePalette();
  wireEvents();
  initEditor();
  updateNamesUi();
  document.getElementById('caPositionLabel').textContent = state.positionLabel;
}



init();

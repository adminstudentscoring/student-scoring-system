'use strict';

function registerVcpChessBoard(ctx: any): void {
  const { VCP_FILES } = ctx;

  function vcpCoordToRc(coord: any) {
    const s = String(coord || '');
    const f = VCP_FILES.indexOf(s[0]);
    const rank = Number(s[1] || 0);
    if (f < 0 || rank < 1 || rank > 8) return null;
    return { r: 8 - rank, c: f };
  }

  function vcpRcToCoord(r: any, c: any) {
    return `${VCP_FILES[c]}${8 - r}`;
  }

  function vcpPieceColor(p: any) {
    if (!p) return null;
    return p === p.toUpperCase() ? 'w' : 'b';
  }

  function vcpOpp(c: any) {
    return c === 'w' ? 'b' : 'w';
  }

  function vcpInBounds(r: any, c: any) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function vcpCloneBoard(b: any) {
    return b.map((row: any) => row.slice());
  }

  function vcpInitialBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(''));
    const backW = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    const backB = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    b[7] = backW.slice();
    b[6] = Array(8).fill('P');
    b[0] = backB.slice();
    b[1] = Array(8).fill('p');
    return b;
  }

  function vcpFindKing(board: any, color: any) {
    const k = color === 'w' ? 'K' : 'k';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === k) return { r, c };
    return null;
  }

  function vcpIsSquareAttacked(board: any, r: any, c: any, byColor: any) {
    // pawns
    const pawnDir = byColor === 'w' ? -1 : 1;
    const pawn = byColor === 'w' ? 'P' : 'p';
    for (const dc of [-1, 1]) {
      const rr = r + pawnDir, cc = c + dc;
      if (vcpInBounds(rr, cc) && board[rr][cc] === pawn) return true;
    }
    // knights
    const knight = byColor === 'w' ? 'N' : 'n';
    const kd = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of kd) {
      const rr = r + dr, cc = c + dc;
      if (vcpInBounds(rr, cc) && board[rr][cc] === knight) return true;
    }
    // king
    const king = byColor === 'w' ? 'K' : 'k';
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (vcpInBounds(rr, cc) && board[rr][cc] === king) return true;
    }
    // sliding
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (vcpInBounds(rr, cc)) {
        const p = board[rr][cc];
        if (p) {
          const col = vcpPieceColor(p);
          if (col === byColor) {
            const up = p.toUpperCase();
            if ((dr === 0 || dc === 0) && (up === 'R' || up === 'Q')) return true;
            if ((dr !== 0 && dc !== 0) && (up === 'B' || up === 'Q')) return true;
          }
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  }

  function vcpIsInCheck(board: any, color: any) {
    const k = vcpFindKing(board, color);
    if (!k) return false;
    return vcpIsSquareAttacked(board, k.r, k.c, vcpOpp(color));
  }

  Object.assign(ctx, {
    vcpCoordToRc,
    vcpRcToCoord,
    vcpPieceColor,
    vcpOpp,
    vcpInBounds,
    vcpCloneBoard,
    vcpInitialBoard,
    vcpFindKing,
    vcpIsSquareAttacked,
    vcpIsInCheck
  });
}

module.exports = { registerVcpChessBoard };
export {};

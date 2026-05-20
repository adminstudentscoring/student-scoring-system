'use strict';

const { registerVcpChessBoard } = require('./chessBoard');
const { registerVcpChessMoves } = require('./chessMoves');
const { registerVcpChessSan } = require('./chessSan');
const { registerVcpChessSession } = require('./chessSession');

function registerVcpChessEngine(ctx: any): void {
  registerVcpChessBoard(ctx);
  registerVcpChessMoves(ctx);
  registerVcpChessSan(ctx);
  registerVcpChessSession(ctx);
}

module.exports = { registerVcpChessEngine };
export {};

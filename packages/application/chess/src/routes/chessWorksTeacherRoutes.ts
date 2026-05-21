// Chess Works teacher routes — thin wrapper
"use strict";

const { registerChessWorksTeacherFoldersRoutes } = require('./chessWorksTeacherFoldersRoutes');
const { registerChessWorksTeacherWorksRoutes } = require('./chessWorksTeacherWorksRoutes');
const { registerChessWorksTeacherAssignRoutes } = require('./chessWorksTeacherAssignRoutes');
const { registerChessWorksTeacherReviewRoutes } = require('./chessWorksTeacherReviewRoutes');

function registerChessWorksTeacherRoutes(app: any, shared: any): void {
  registerChessWorksTeacherFoldersRoutes(app, shared);
  registerChessWorksTeacherWorksRoutes(app, shared);
  registerChessWorksTeacherAssignRoutes(app, shared);
  registerChessWorksTeacherReviewRoutes(app, shared);
}

module.exports = { registerChessWorksTeacherRoutes };
export {};

"use strict";

const express = require('express');
const path = require('path');

export function registerTruceboardRoutes(app: any): void {
  if (!app) throw new Error('registerTruceboardRoutes: missing app');
  const staticDir = path.join(__dirname, '..', '..', '..', '..', 'application', 'truceboard');
  app.use('/truceboard', express.static(staticDir));
}

    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 12px 15px;
    background: #fff;
    display: flex;
    flex-direction: column;
  }
  
  #salesCartContent {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  
  .cart-empty-state {
    flex: 0 0 auto;
    display: none;
    min-height: 0;
    padding: 0;
    margin: 0;
  }

  .vchess-invoice-import-panel {
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 13px;
    color: #334155;
  }
  .vchess-invoice-import-title {
    font-weight: 700;
    margin-bottom: 6px;
    color: #0f172a;
  }
  .vchess-invoice-import-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .vchess-invoice-import-status {
    font-size: 12px;
    color: #64748b;
  }
  .vchess-invoice-import-banner {
    font-size: 12px;
    color: #475569;
    margin-bottom: 6px;
  }
  .vchess-invoice-import-hint {
    margin: 0;
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.4;
  }
  .vchess-invoice-import-hint code {
    font-size: 10px;
    background: #e2e8f0;
    padding: 1px 4px;
    border-radius: 4px;
  }
  
  .sales-footer-actions {
    padding: 10px 12px;
    border-top: 1px solid #e0e0e0;
    background: #f8f9fa;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
  }
  
  .sales-footer-actions .btn {
    flex: 0 1 auto;
  }
  
  @media (max-width: 1024px) {
    .sales-container {
      flex-direction: column;
    }
    
    .sales-right-panel {
      width: 100%;
      min-width: 0;
      min-height: 300px;
    }
  }
  
  .package-price-preview {
    margin: 20px 0;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 4px;
    border-left: 4px solid #3b82f6;
  }
  
  .price-preview-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
    font-size: 16px;
  }
  
  .price-preview-item:last-child {
    margin-bottom: 0;
    padding-top: 10px;
    border-top: 1px solid #e0e0e0;
  }
  
  .price-label {
    color: #333;
    font-weight: 500;
  }
  
  .price-value {
    color: #333;
    font-weight: bold;
  }
  
  .price-value.save {
    color: #10b981;
  }
  
  .btn-sm {
    padding: 4px 8px;
    font-size: 12px;
  }
  
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
  }
  
  @media (max-width: 768px) {
    .form-row {
      grid-template-columns: 1fr;
    }
  }

  /* Sales Class Selection Styles */
  .class-selection-header {
    display: flex;
    align-items: center;
    padding: 15px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
  }
  
  .btn-back {
    background: none;
    border: none;
    color: #007aff;
    font-size: 14px;
    cursor: pointer;
    margin-right: 15px;
    padding: 5px;
    font-weight: 500;
  }
  
  .btn-back:hover {
    text-decoration: underline;
  }
  
  .selection-title h3 {
    margin: 0;
    font-size: 16px;
    color: #333;
  }
  
  .selection-subtitle {
    font-size: 12px;
    color: #666;
  }
  
  .class-selection-controls {
    padding: 15px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fff;
  }
  
  .selection-mode {
    display: flex;
    gap: 15px;
  }
  
  .selection-mode label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    font-size: 14px;
    color: #333;
  }
  
  .lessons-count {
    font-size: 14px;
    color: #666;
  }
  
  .available-classes-list {
    padding: 15px;
    overflow-y: auto;
    flex: 1;
  }
  
  .class-selection-item {
    margin-bottom: 10px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    transition: all 0.2s;
  }
  
  .class-selection-item:hover {
    border-color: #007aff;
    background: #f8f9fa;
  }
  
  .class-checkbox-label {
    display: flex;
    align-items: center;
    padding: 12px;
    cursor: pointer;
    width: 100%;
  }
  
  .class-select-cb {
    margin-right: 15px;
    width: 18px;
    height: 18px;
  }
  
  .class-info {
    flex: 1;
  }
  
  .class-date {
    font-weight: 600;
    color: #333;
  }
  
  .class-time {
    color: #666;
    font-size: 13px;
  }
  
  .class-teacher {
    color: #888;
    font-size: 12px;
  }
  
  .class-selection-actions {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #e0e0e0;
  }
  
  .btn-block {
    display: block;
    width: 100%;
  }
  
  /* Cart Item Styles */
  .cart-item {
    background: #f8f9fa;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 10px;
  }
  
  .cart-item-body {
    cursor: pointer;
    border-radius: 4px;
    margin: -4px -4px 6px -4px;
    padding: 4px;
    transition: background 0.12s ease;
  }
  
  .cart-item-body:hover {
    background: rgba(15, 23, 42, 0.04);
  }
  
  .cart-item-hint {
    color: #94a3b8;
    font-weight: 500;
  }
  
  .cart-item-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 5px;
  }
  
  .cart-item-title {
    font-weight: 600;
    color: #333;
    font-size: 14px;
  }
  
  .cart-item-price {
    font-weight: bold;
    color: #333;
  }
  
  .cart-item-details {
    font-size: 12px;
    color: #666;
    margin-bottom: 8px;
  }
  
  .btn-remove-item {
    background: none;
    border: none;
    color: #ef4444;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
  }
  
  .btn-remove-item:hover {
    text-decoration: underline;
  }
  
  .cart-total {
    display: flex;
    justify-content: space-between;
    padding: 15px 0;
    border-top: 2px solid #e0e0e0;
    margin-top: 15px;
    font-weight: bold;
    font-size: 16px;
    color: #333;
  }
`;

document.head.appendChild(style);

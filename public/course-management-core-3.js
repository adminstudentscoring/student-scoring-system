    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .sales-right-panel {
    width: 350px;
    min-width: 350px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .sales-product-search {
    padding: 15px;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .sales-product-categories {
    display: flex;
    padding: 10px 15px;
    gap: 10px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
  }
  
  .category-btn {
    padding: 6px 12px;
    border: 1px solid #e0e0e0;
    background: #fff;
    border-radius: 20px;
    cursor: pointer;
    font-size: 14px;
    color: #666;
    transition: all 0.2s;
  }
  
  .category-btn.active {
    background: #007aff;
    color: #fff;
    border-color: #007aff;
  }
  
  .sales-product-list {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 15px;
    align-content: start;
  }
  
  .sales-product-card {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 15px;
    cursor: pointer;
    transition: all 0.2s;
    background: #fff;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }
  
  .sales-product-card:hover {
    border-color: #007aff;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    transform: translateY(-2px);
  }
  
  .product-type-badge {
    display: inline-block;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 12px;
    margin-bottom: 8px;
    width: fit-content;
    color: #fff;
    font-weight: 500;
  }
  
  .product-type-badge.package {
    background-color: #10b981;
  }
  
  .product-type-badge.course {
    background-color: #8b5cf6;
  }
  
  .product-name {
    font-weight: 600;
    color: #333;
    margin-bottom: 10px;
    font-size: 15px;
    padding-left: 0;
  }
  
  .product-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 10px;
    padding-left: 0;
  }
  
  .product-info {
    font-size: 12px;
    color: #666;
  }
  
  .product-price {
    font-weight: bold;
    color: #333;
    font-size: 16px;
  }
  
  /* Sales Right Panel Styles */
  .sales-student-section {
    padding: 10px 12px 12px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
    position: relative;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  .sales-student-below-search {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 2px;
  }
  
  .sales-create-student-row {
    display: flex;
    align-items: center;
  }
  
  .student-search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 0 10px;
  }
  
  .student-search-wrapper:focus-within {
    border-color: #007aff;
    box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.18);
  }
  
  .search-icon {
    color: #999;
    margin-right: 8px;
  }
  
  .student-search-wrapper input {
    flex: 1;
    border: none;
    padding: 10px 0;
    outline: none;
    font-size: 14px;
  }
  
  .dropdown-arrow {
    color: #999;
    font-size: 12px;
    margin-left: 8px;
  }
  
  .student-search-wrapper .student-dropdown-list {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    z-index: 200;
    max-height: min(300px, 40vh);
    overflow-y: auto;
  }
  
  .dropdown-item {
    padding: 10px 15px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
  }
  
  .dropdown-item:last-child {
    border-bottom: none;
  }
  
  .dropdown-item:hover {
    background: rgba(0, 122, 255, 0.06);
  }
  
  .dropdown-item.empty {
    padding: 20px;
    justify-content: center;
    color: #999;
    font-style: italic;
    cursor: default;
  }
  
  .student-avatar-small {
    width: 32px;
    height: 32px;
    background: #e0f2fe;
    color: #0284c7;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 14px;
  }
  
  .student-info {
    flex: 1;
  }
  
  .student-name {
    font-weight: 500;
    color: #333;
    font-size: 14px;
  }
  
  .student-id {
    font-size: 12px;
    color: #666;
  }
  
  .empty-student-state {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 2px 0 6px;
    font-size: 13px;
  }
  
  .btn-sales-new-student {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 4px 8px 4px 4px;
    border: 1px solid transparent;
    background: transparent;
    color: #64748b;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    border-radius: 6px;
    box-shadow: none;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }
  
  .btn-sales-new-student:hover {
    background: rgba(15, 23, 42, 0.04);
    border-color: var(--ui-border, #d0d4dc);
    color: #475569;
  }
  
  .btn-sales-new-student:active {
    background: rgba(15, 23, 42, 0.06);
  }
  
  .btn-sales-new-student-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 4px;
    background: transparent;
    border: 1px solid transparent;
    font-size: 1rem;
    line-height: 1;
    font-weight: 700;
    color: #94a3b8;
  }
  
  .btn-sales-new-student:hover .btn-sales-new-student-icon {
    color: #64748b;
    border-color: var(--ui-border, #d0d4dc);
  }
  
  .btn-sales-new-student-label {
    letter-spacing: 0.01em;
  }
  
  .btn-sales-new-student:focus-visible {
    outline: 2px solid var(--ui-accent, #2563eb);
    outline-offset: 2px;
  }
  
  .btn-outline {
    background: transparent;
    border: 1px solid #e0e0e0;
    color: #666;
  }
  
  .btn-outline:hover {
    background: #f8f9fa;
    color: #333;
  }
  
  .selected-student-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 12px 12px 12px;
    margin: 0;
    position: relative;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: saturate(180%) blur(12px);
    -webkit-backdrop-filter: saturate(180%) blur(12px);
    border: 1px solid rgba(60, 60, 67, 0.1);
    border-radius: 14px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.06);
  }
  
  .selected-student-avatar {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    background: linear-gradient(180deg, rgba(0, 122, 255, 0.14), rgba(0, 122, 255, 0.06));
    color: #0071e3;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 17px;
    letter-spacing: -0.02em;
  }
  
  .selected-student-info h3 {
    margin: 0 0 4px 0;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: #1d1d1f;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  
  .btn-sales-student-edit {
    margin-left: 4px;
    padding: 1px 8px;
    min-height: 0;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.2;
    letter-spacing: -0.01em;
    border-radius: 980px;
    border: 1px solid rgba(60, 60, 67, 0.18);
    background: rgba(120, 120, 128, 0.08);
    color: #1d1d1f;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  
  .btn-sales-student-edit:hover {
    background: rgba(120, 120, 128, 0.12);
    border-color: rgba(60, 60, 67, 0.22);
  }
  
  .student-name-plain {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: #1d1d1f;
  }
  
  .btn-sales-student-history {
    margin-left: 4px;
    padding: 1px 8px;
    min-height: 0;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.2;
    letter-spacing: -0.01em;
    border-radius: 980px;
    border: 1px solid rgba(60, 60, 67, 0.18);
    background: rgba(120, 120, 128, 0.08);
    color: #1d1d1f;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  
  .btn-sales-student-history:hover {
    background: rgba(120, 120, 128, 0.12);
    border-color: rgba(60, 60, 67, 0.22);
  }
  
  .student-id-badge {
    background: #f3f4f6;
    color: #666;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: normal;
  }
  
  .student-balance {
    font-size: 13px;
    color: #6e6e73;
    letter-spacing: -0.01em;
  }
  
  
  .btn-close-student {
    position: absolute;
    top: 0;
    right: 0;
    background: none;
    border: none;
    color: #999;
    font-size: 20px;
    cursor: pointer;
    padding: 5px;
  }
  
  .btn-close-student:hover {
    color: #ef4444;
  }
  
  .sales-cart-section {

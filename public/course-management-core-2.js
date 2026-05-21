  }
  
  .course-sub-tab.active {
    color: #007aff;
    background: rgba(0, 122, 255, 0.1);
    border-left-color: #007aff;
    font-weight: 600;
  }
  
  .course-sub-tab-content {
    display: none;
    flex: 1;
    padding: 25px;
    overflow-y: auto;
    background: #fff;
    color: #333;
  }
  
  .course-sub-tab-content.active {
    display: block;
  }
  
  .course-management-content {
    flex: 1;
    min-width: 0;
    background: #fff;
  }
  
  @media (max-width: 768px) {
    .course-management {
      flex-direction: column;
    }
    
    .course-sub-tabs {
      width: 100%;
      flex-direction: row;
      border-right: none;
      border-bottom: 2px solid #e0e0e0;
      border-radius: 8px 8px 0 0;
      overflow-x: auto;
      background: #f8f9fa;
    }
    
    .course-sub-tab {
      white-space: nowrap;
      border-left: none;
      border-bottom: 3px solid transparent;
      color: #333;
    }
    
    .course-sub-tab.active {
      border-left: none;
      border-bottom-color: #007aff;
      color: #007aff;
    }
    
    .course-sub-tab-content {
      padding: 15px;
    }
  }
  
  .courses-header {
    margin-bottom: 20px;
  }
  
  .courses-controls {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }
  
  .search-filter-group {
    display: flex;
    gap: 15px;
    align-items: center;
    flex-wrap: wrap;
  }
  
  .search-input {
    flex: 1;
    min-width: 200px;
    padding: 8px 12px;
    border: 2px solid #e0e0e0;
    border-radius: 4px;
    background: #fff;
    color: #333;
  }
  
  .price-filter {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 200px;
  }
  
  .price-filter label {
    font-size: 14px;
    color: #333;
  }
  
  .range-slider-container {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  
  .range-slider-container input[type="range"] {
    flex: 1;
  }
  
  .sort-select {
    padding: 8px 12px;
    border: 2px solid #e0e0e0;
    border-radius: 4px;
    background: #fff;
    color: #333;
  }
  
  .courses-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  
  .courses-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e0e0e0;
  }
  
  .courses-table thead {
    background: #f8f9fa;
  }
  
  .courses-table th {
    padding: 12px;
    text-align: left;
    font-weight: bold;
    color: #333;
    border-bottom: 2px solid #e0e0e0;
  }
  
  .courses-table td {
    padding: 12px;
    border-top: 1px solid #e0e0e0;
    color: #333;
  }
  
  .courses-table tbody tr.selected {
    background: rgba(0, 122, 255, 0.06);
  }
  
  .courses-table tbody tr:hover {
    background: #f8f9fa;
  }
  
  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 20px;
    padding: 15px;
    background: #fff;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
  }
  
  .pagination-info {
    color: #333;
  }
  
  .pagination-controls {
    display: flex;
    gap: 15px;
    align-items: center;
  }
  
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  }
  
  .modal-content {
    background: #fff;
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .modal-header h2 {
    margin: 0;
    color: #333;
  }
  
  .modal-close {
    background: none;
    border: none;
    color: #666;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }

  .modal-close:hover {
    color: #333;
  }
  
  .modal-body {
    padding: 20px;
  }
  
  .form-group {
    margin-bottom: 20px;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 8px;
    color: #333;
    font-weight: 500;
  }
  
  .required {
    color: #ef4444;
  }
  
  .form-group input[type="text"] {
    width: 100%;
    padding: 8px 12px;
    border: 2px solid #e0e0e0;
    border-radius: 4px;
    background: #fff;
    color: #333;
    box-sizing: border-box;
  }
  
  .input-hint {
    display: block;
    margin-top: 5px;
    font-size: 12px;
    color: #666;
  }
  
  .error-message {
    color: #ef4444;
    font-size: 12px;
    margin-top: 5px;
  }
  
  .color-selector {
    margin-top: 10px;
  }
  
  .predefined-colors {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    margin-bottom: 15px;
  }
  
  .color-option {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    cursor: pointer;
    border: 2px solid rgba(0, 0, 0, 0.06);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  
  .color-option:hover {
    transform: scale(1.06);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 12px rgba(0, 0, 0, 0.12);
  }
  
  .color-option.selected {
    border-color: rgba(0, 0, 0, 0.28);
    box-shadow: 0 0 0 2px #fff, 0 0 0 4px rgba(0, 122, 255, 0.45);
  }
  
  .custom-color-input {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  
  .custom-color-input input[type="text"] {
    flex: 1;
  }
  
  .custom-color-input input[type="color"] {
    width: 50px;
    height: 40px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    cursor: pointer;
  }
  
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 20px;
  }
  
  .toast {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: #fff;
    font-weight: 500;
    z-index: 10001;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s;
  }
  
  .toast.show {
    opacity: 1;
    transform: translateX(0);
  }
  
  .toast-success {
    background: #10b981;
  }
  
  .toast-error {
    background: #ef4444;
  }
  
  @media (max-width: 768px) {
    .courses-table {
      display: block;
      overflow-x: auto;
    }
    
    .search-filter-group {
      flex-direction: column;
    }
    
    .predefined-colors {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  
  /* Package Management Styles */
  .package-courses-cell {
    position: relative;
  }
  
  .package-courses-summary {
    color: #007aff;
    text-decoration: underline;
    cursor: pointer;
  }
  
  .package-courses-summary:hover {
    color: #5568d3;
  }
  
  .package-courses-details {
    margin-top: 10px;
    padding: 10px;
    background: #f8f9fa;
    border-radius: 4px;
    border-left: 3px solid #007aff;
  }
  
  .package-course-detail {
    padding: 5px 0;
    color: #333;
    font-size: 14px;
  }
  
  .package-course-detail.deleted {
    color: #ef4444;
    font-style: italic;
  }
  
  .package-total {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #e0e0e0;
    font-weight: bold;
    color: #333;
  }
  
  .package-status {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }
  
  .package-status.active {
    background: #10b981;
    color: #fff;
  }
  
  .package-status.inactive {
    background: #6b7280;
    color: #fff;
  }
  
  .package-status.archived {
    background: #ef4444;
    color: #fff;
  }
  
  .package-courses-table-container {
    margin-top: 10px;
  }
  
  .package-courses-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid #e0e0e0;
  }
  
  .package-courses-table thead {
    background: #f8f9fa;
  }
  
  .package-courses-table th {
    padding: 8px;
    text-align: left;
    font-weight: bold;
    color: #333;
    font-size: 13px;
    border-bottom: 2px solid #e0e0e0;
  }
  
  .package-courses-table td {
    padding: 8px;
    border-top: 1px solid #e0e0e0;
    color: #333;
  }
  
  .package-courses-table select,
  .package-courses-table input[type="number"] {
    width: 100%;
    padding: 6px 8px;
    border: 2px solid #e0e0e0;
    border-radius: 4px;
    background: #fff;
    color: #333;
    box-sizing: border-box;
  }
  
  .package-courses-table select option {
    background: #fff;
    color: #333;
  }
  
  /* Sales Module Styles */
  .sales-container {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    gap: 20px;
  }

  .sales-left-panel {
    flex: 1;

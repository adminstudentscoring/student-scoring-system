  }

  // Auto-init
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      initAdminPriceSetting().catch(err => console.error(err));
    });
  } else {
    initAdminPriceSetting().catch(err => console.error(err));
  }
})();



// Router System for Puzzle Monster Fight
// Handles hash-based routing and page navigation

const Router = (() => {
  const routes = {
    '/home': 'home',
    '/story': 'story',
    '/challenge': 'challenge',
    '/practice': 'practice',
    '/backpack': 'backpack',
    '/pets': 'pets',
    '/shop': 'shop',
    '/settings': 'settings',
    '/pet-list': 'pet-list',
    '/item-list': 'item-list'
  };

  let currentPage = null;
  let pageContainer = null;

  function init(container) {
    pageContainer = container;
    
    // Listen for hash changes
    window.addEventListener('hashchange', handleRoute);
    
    // Set default route to /home if no hash
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '#/home';
    } else {
      // Handle initial route
      handleRoute();
    }
  }

  function handleRoute() {
    const hash = window.location.hash.slice(1) || '/home';
    const route = routes[hash] || 'home';
    
    if (currentPage !== route) {
      navigateTo(route);
    }
  }

  function navigateTo(page) {
    if (!pageContainer) return;

    // Fade out current page
    if (currentPage) {
      pageContainer.style.opacity = '0';
      
      setTimeout(() => {
        currentPage = page;
        renderPage(page);
        
        // Update active nav item
        updateActiveNav(page);
        
        // Fade in new page
        setTimeout(() => {
          pageContainer.style.opacity = '1';
        }, 50);
      }, 200);
    } else {
      currentPage = page;
      renderPage(page);
      updateActiveNav(page);
      pageContainer.style.opacity = '1';
    }
  }

  function renderPage(page) {
    if (!pageContainer) return;

    switch (page) {
      case 'home':
        pageContainer.innerHTML = HomePage.render();
        HomePage.init();
        break;
      case 'story':
        pageContainer.innerHTML = StoryPage.render();
        break;
      case 'challenge':
        pageContainer.innerHTML = ChallengePage.render();
        break;
      case 'practice':
        pageContainer.innerHTML = PracticePage.render();
        PracticePage.init();
        break;
      case 'backpack':
        pageContainer.innerHTML = BackpackPage.render();
        break;
      case 'pets':
        pageContainer.innerHTML = PetsPage.render();
        break;
      case 'shop':
        pageContainer.innerHTML = ShopPage.render();
        break;
      case 'settings':
        pageContainer.innerHTML = SettingsPage.render();
        break;
      case 'pet-list':
        pageContainer.innerHTML = PetListPage.render();
        PetListPage.init();
        break;
      case 'item-list':
        pageContainer.innerHTML = ItemListPage.render();
        break;
      default:
        pageContainer.innerHTML = HomePage.render();
        HomePage.init();
    }
  }

  function updateActiveNav(page) {
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    navItems.forEach(item => {
      const route = item.dataset.route;
      if (route === `/${page}`) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  function goTo(route) {
    window.location.hash = `#${route}`;
  }

  return {
    init,
    goTo,
    navigateTo
  };
})();


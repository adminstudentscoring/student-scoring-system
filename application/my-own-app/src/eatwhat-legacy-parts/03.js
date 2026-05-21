
        const me = await window.authUtils.verifyAuth().catch(() => null);
        if (!me || me.role !== "admin") {
          alert("You do not have permission to access this page");
          window.authUtils.logout?.();
          return;
        }

        bind();
        const s = await loadStateFromDb().catch(() => null);
        ui.state = normalizeState(s || defaultState());
        renderAll();
      } catch (e) {
        toast(e?.message || String(e), "err");
      }
    })();
  });
})();




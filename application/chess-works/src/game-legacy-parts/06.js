        if (!isTeacher) {
          await setMain(`<div class="cw-muted">Builder is for teachers only.</div>`);
          return;
        }
        await loadBuilder();
        return;
      }
      if (ui.mode === "works") {
        if (isTeacher) return await loadTeacherWorksList();
        return await loadStudentWorksList();
      }
      if (ui.mode === "history") {
        if (isStudent) return await loadStudentHistory();
        await setMain(`<div class="cw-muted">History is student-only for now.</div>`);
        return;
      }
      if (ui.mode === "settings") {
        await loadSettings();
        return;
      }
      await setMain(`<div class="cw-muted">Unknown mode.</div>`);
    }

    bindNav();
    await rerenderMain();
  };
})();



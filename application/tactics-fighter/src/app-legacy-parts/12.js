        return void studentChangePuzzlePage(dir);
      }

      const startBtn = target.closest('[data-stu-start]');
      if (startBtn) {
        (async () => {
          // Start: skip completed, jump to the earliest not-completed (or previously incorrect) puzzle.
          const abs = await findFirstTargetAbsIndex();
          ui.student.runner = { absIndex: abs };
          await openStudentRunnerModal();
        })();
        return;
      }

      const openBtn = target.closest('[data-stu-open-puzzle]');
      if (openBtn) {
        const idx = Number(openBtn.getAttribute('data-stu-idx') || 0);
        const ps = Math.max(1, Number(ui.student.pageSize || 10));
        const abs = (Math.max(1, Number(ui.student.page || 1)) - 1) * ps + (Number.isFinite(idx) ? idx : 0);
        ui.student.runner = { absIndex: abs };
        (async () => { await openStudentRunnerModal(); })();
        return;
      }
    });

    // Initial render
    activateMode(mode);
  };

}



(function () {
  'use strict';

  const stage = (chapterId, stageId) => `images/Tutorial/Chapter${String(chapterId).padStart(2, '0')}/Stage${String(stageId).padStart(2, '0')}`;

  window.ChessPalTutorialContent = {
    ch1s1: [
      {
        title: 'Stage 1 Tutorial',
        text: 'Drag your knight path across jewels to build your turn.',
        image: `${stage(1, 1)}/Slide01.png`,
      },
      {
        title: 'Match Basics',
        text: 'Matching more jewels improves score and increases damage output.',
        image: `${stage(1, 1)}/Slide02.png`,
      },
    ],
    ch1s2: [
      {
        title: 'Stage 2 Tutorial',
        text: 'Watch your team cooldown and plan around ready skills.',
        image: `${stage(1, 2)}/Slide01.png`,
      },
      {
        title: 'Targeting',
        text: 'Tap a monster to focus attacks on that target.',
        image: `${stage(1, 2)}/Slide02.png`,
      },
    ],
    ch1s3: [
      {
        title: 'Stage 3 Tutorial',
        text: 'Cascades can chain extra damage after your main path.',
        image: `${stage(1, 3)}/Slide01.png`,
      },
      {
        title: 'Turn Flow',
        text: 'When combat starts, actions are locked until resolution ends.',
        image: `${stage(1, 3)}/Slide02.png`,
      },
    ],
    ch1s4: [
      {
        title: 'Stage 4 Tutorial',
        text: 'Use recovery opportunities to keep your team healthy.',
        image: `${stage(1, 4)}/Slide01.png`,
      },
      {
        title: 'Efficiency',
        text: 'Short, clean routes often give better control than long risky ones.',
        image: `${stage(1, 4)}/Slide02.png`,
      },
    ],
    ch1s5: [
      {
        title: 'Boss Stage Tutorial',
        text: 'Boss fights are longer. Save important skills for key turns.',
        image: `${stage(1, 5)}/Slide01.png`,
      },
      {
        title: 'Final Push',
        text: 'Focus target choice and combo consistency to secure the clear.',
        image: `${stage(1, 5)}/Slide02.png`,
      },
    ],
    ch2s1_end: [
      {
        title: 'Tutorial Complete',
        text: 'You are ready. Continue your journey and build stronger teams.',
        image: `${stage(2, 1)}/Slide01.png`,
      },
    ],
  };
})();

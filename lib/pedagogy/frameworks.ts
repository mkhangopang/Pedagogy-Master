
export const BLOOM_TAXONOMY = {
  name: "Bloom's Taxonomy",
  levels: [
    {
      level: 'Remember',
      description: 'Recall facts and basic concepts',
      verbs: ['define', 'list', 'recall', 'identify', 'name', 'state', 'describe'],
      questionStems: ['What is...?', 'Who was...?', 'Where is...?', 'List the...']
    },
    {
      level: 'Understand',
      description: 'Explain ideas or concepts',
      verbs: ['explain', 'describe', 'summarize', 'interpret', 'classify', 'compare'],
      questionStems: ['Explain why...', 'Summarize...', 'How would you compare...?']
    },
    {
      level: 'Apply',
      description: 'Use information in new situations',
      verbs: ['demonstrate', 'solve', 'use', 'illustrate', 'apply', 'construct'],
      questionStems: ['How would you solve...?', 'What would happen if...?']
    },
    {
      level: 'Analyze',
      description: 'Draw connections among ideas',
      verbs: ['analyze', 'examine', 'compare', 'contrast', 'investigate', 'categorize'],
      questionStems: ['What is the relationship between...?', 'Why does... work?']
    },
    {
      level: 'Evaluate',
      description: 'Justify a decision or course of action',
      verbs: ['judge', 'critique', 'justify', 'evaluate', 'assess', 'defend'],
      questionStems: ['What is your opinion of...?', 'How would you rate...?']
    },
    {
      level: 'Create',
      description: 'Produce new or original work',
      verbs: ['design', 'construct', 'develop', 'create', 'formulate', 'invent'],
      questionStems: ['How would you design...?', 'What would you create to...?']
    }
  ]
};

export const MADELINE_HUNTER = {
  name: "Madeline Hunter Model",
  steps: [
    { phase: 'Anticipatory Set', description: 'Hook to grab student attention' },
    { phase: 'Objective & Purpose', description: 'State learning goals' },
    { phase: 'Input/Modeling', description: 'Present new info' },
    { phase: 'Guided Practice', description: 'Supported practice' },
    { phase: 'Check Understanding', description: 'Assess comprehension' },
    { phase: 'Independent Practice', description: 'Solo application' },
    { phase: 'Closure', description: 'Review and summary' }
  ]
};

export const FIVE_E_MODEL = {
  name: "5E Instructional Model",
  phases: ['Engage', 'Explore', 'Explain', 'Elaborate', 'Evaluate']
};

export const DIFFERENTIATION_STRATEGIES = {
  content: {
    below: ['Simplified vocabulary', 'Visual aids', 'Pre-teaching concepts'],
    at: ['Grade-level materials', 'Standard vocabulary'],
    above: ['Complex texts', 'Extension readings', 'Independent research']
  }
};

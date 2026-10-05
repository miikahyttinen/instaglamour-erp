// Texts for the Tasks feature (UC-017). Included in src/i18n/fi.ts and en.ts under `tasks`.
// FI and EN must have exactly the same keys (checked by i18n.test.ts).

export const fi = {
  tasks: {
    add: 'Lisää tehtävä',
    newTask: 'Uusi tehtävä',
    filterLabel: 'Näytä tehtävät',
    filter: {
      OPEN: 'Avoimet',
      DONE: 'Tehdyt',
      ALL: 'Kaikki',
    },
    onlyMine: 'Vain omat tehtävät',
    empty: 'Ei tehtäviä.',
    overdue: 'Myöhässä',
    shown: '{{filter}}: {{count}}',
    overdueCount: 'Myöhässä: {{count}}',
    completed: 'Tehty {{date}}',
    markDone: 'Merkitse tehdyksi: {{title}}',
    reopen: 'Avaa uudelleen: {{title}}',
    deleteAria: 'Poista: {{title}}',
    deleteTitle: 'Poista tehtävä',
    descriptionPlaceholder: 'Lisää kuvaus',
    field: {
      title: 'Otsikko',
      owner: 'Vastuuhenkilö',
      dueDate: 'Eräpäivä',
      description: 'Kuvaus',
    },
    confirmDelete: 'Poistetaanko tehtävä ”{{title}}”?',
    confirmDeleteYes: 'Kyllä, poista',
  },
};

export const en: typeof fi = {
  tasks: {
    add: 'Add task',
    newTask: 'New task',
    filterLabel: 'Show tasks',
    filter: {
      OPEN: 'Open',
      DONE: 'Done',
      ALL: 'All',
    },
    onlyMine: 'My tasks only',
    empty: 'No tasks.',
    overdue: 'Overdue',
    shown: '{{filter}}: {{count}}',
    overdueCount: 'Overdue: {{count}}',
    completed: 'Done {{date}}',
    markDone: 'Mark done: {{title}}',
    reopen: 'Reopen: {{title}}',
    deleteAria: 'Delete: {{title}}',
    deleteTitle: 'Delete task',
    descriptionPlaceholder: 'Add description',
    field: {
      title: 'Title',
      owner: 'Owner',
      dueDate: 'Due date',
      description: 'Description',
    },
    confirmDelete: 'Delete task “{{title}}”?',
    confirmDeleteYes: 'Yes, delete',
  },
};

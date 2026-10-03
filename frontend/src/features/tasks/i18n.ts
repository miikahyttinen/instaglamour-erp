// Texts for the Tasks feature (UC-017). Included in src/i18n/fi.ts and en.ts under `tasks`.
// FI and EN must have exactly the same keys (checked by i18n.test.ts).

export const fi = {
  tasks: {
    add: 'Lisää tehtävä',
    newTask: 'Uusi tehtävä',
    editTask: 'Muokkaa tehtävää',
    filterLabel: 'Näytä tehtävät',
    filter: {
      OPEN: 'Avoimet',
      DONE: 'Tehdyt',
      ALL: 'Kaikki',
    },
    onlyMine: 'Vain omat tehtävät',
    empty: 'Ei tehtäviä.',
    overdue: 'Myöhässä',
    noDueDate: 'Ei eräpäivää',
    due: 'Eräpäivä {{date}}',
    completed: 'Tehty {{date}}',
    owner: 'Vastuuhenkilö',
    markDone: 'Merkitse tehdyksi: {{title}}',
    reopen: 'Avaa uudelleen: {{title}}',
    editAria: 'Muokkaa: {{title}}',
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
    editTask: 'Edit task',
    filterLabel: 'Show tasks',
    filter: {
      OPEN: 'Open',
      DONE: 'Done',
      ALL: 'All',
    },
    onlyMine: 'My tasks only',
    empty: 'No tasks.',
    overdue: 'Overdue',
    noDueDate: 'No due date',
    due: 'Due {{date}}',
    completed: 'Done {{date}}',
    owner: 'Owner',
    markDone: 'Mark done: {{title}}',
    reopen: 'Reopen: {{title}}',
    editAria: 'Edit: {{title}}',
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

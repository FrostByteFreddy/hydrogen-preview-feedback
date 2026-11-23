/** UI text. Pick a built-in locale and override single labels as needed. */
export type PreviewFeedbackLabels = {
  comment: string;
  openCount: (n: number) => string;
  pickHint: string;
  withoutSpot: string;
  cancel: string;
  newComment: string;
  yourName: string;
  namePlaceholder: string;
  commentLabel: string;
  commentPlaceholder: string;
  save: string;
  saving: string;
  saveFailed: string;
  close: string;
  openPin: (n: number) => string;
  statusOpen: string;
  statusResolved: string;
  reply: string;
  replyPlaceholder: string;
  sendReply: string;
  markResolved: string;
  reopen: string;
  allComments: string;
  hideResolved: string;
  empty: string;
  homePage: string;
  replies: (n: number) => string;
  unknownAuthor: string;
};

const en: PreviewFeedbackLabels = {
  comment: 'Comment',
  openCount: (n) => `${n} open`,
  pickHint: 'Click the spot you want to comment on.',
  withoutSpot: 'No spot',
  cancel: 'Cancel',
  newComment: 'New comment',
  yourName: 'Your name',
  namePlaceholder: 'e.g. Alex',
  commentLabel: 'Comment',
  commentPlaceholder: 'What should we change here?',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: "Couldn't save. Please try again.",
  close: 'Close',
  openPin: (n) => `Open comment ${n}`,
  statusOpen: 'Open',
  statusResolved: 'Resolved',
  reply: 'Reply',
  replyPlaceholder: 'Reply…',
  sendReply: 'Reply',
  markResolved: 'Mark as resolved',
  reopen: 'Reopen',
  allComments: 'Comments',
  hideResolved: 'Hide resolved',
  empty: 'No comments yet.',
  homePage: 'Home page',
  replies: (n) => `${n} ${n === 1 ? 'reply' : 'replies'}`,
  unknownAuthor: 'Unknown',
};

const de: PreviewFeedbackLabels = {
  comment: 'Kommentieren',
  openCount: (n) => `${n} offen`,
  pickHint: 'Klicke auf die Stelle, die du kommentieren möchtest.',
  withoutSpot: 'Ohne Stelle',
  cancel: 'Abbrechen',
  newComment: 'Neuer Kommentar',
  yourName: 'Dein Name',
  namePlaceholder: 'z. B. Alex',
  commentLabel: 'Kommentar',
  commentPlaceholder: 'Was sollen wir hier ändern?',
  save: 'Speichern',
  saving: 'Speichert …',
  saveFailed: 'Speichern hat nicht geklappt. Bitte nochmals versuchen.',
  close: 'Schliessen',
  openPin: (n) => `Kommentar ${n} öffnen`,
  statusOpen: 'Offen',
  statusResolved: 'Erledigt',
  reply: 'Antwort',
  replyPlaceholder: 'Antworten …',
  sendReply: 'Antworten',
  markResolved: 'Als erledigt markieren',
  reopen: 'Wieder öffnen',
  allComments: 'Kommentare',
  hideResolved: 'Erledigte ausblenden',
  empty: 'Noch keine Kommentare.',
  homePage: 'Startseite',
  replies: (n) => `${n} ${n === 1 ? 'Antwort' : 'Antworten'}`,
  unknownAuthor: 'Unbekannt',
};

export const LOCALES = {en, de};
export type PreviewFeedbackLocale = keyof typeof LOCALES;

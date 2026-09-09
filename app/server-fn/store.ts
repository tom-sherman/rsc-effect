/**
 * Stands in for a database. It lives outside `actions.ts` because a
 * `"use server"` module may only export server functions.
 */
const notes: Array<string> = [];

export const listNotes = () => notes as ReadonlyArray<string>;
export const addNote = (note: string) => notes.unshift(note);

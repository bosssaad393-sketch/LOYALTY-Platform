// The data of a Supabase answer, or a thrown error with its message. For code that cannot carry on without the data.

export const must = <T,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

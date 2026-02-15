export const useCheckSession = async () => {
  const { supabase } = useSupabase();
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  return { session, userId };
};

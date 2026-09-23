-- Las funciones de triggers no tienen que poder llamarse desde la API
revoke execute on function public.after_payment_delete(), public.handle_new_user(),
  public.protect_profile_role(), public.touch_updated_at() from public, anon, authenticated;

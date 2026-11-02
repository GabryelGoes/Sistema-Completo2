-- RDA: restringe EXECUTE das RPCs de sessão ao service_role.
-- NÃO aplicar em produção sem homologação.

REVOKE ALL ON FUNCTION public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_work_session_pause(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_work_session_resume(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_work_session_finish(UUID, UUID, UUID, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.rda_work_session_pause(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.rda_work_session_resume(UUID, UUID, UUID, TEXT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.rda_work_session_finish(UUID, UUID, UUID, TEXT) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rda_work_session_start(UUID, UUID, UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rda_work_session_pause(UUID, UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rda_work_session_resume(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rda_work_session_finish(UUID, UUID, UUID, TEXT) TO service_role;

-- Triggers helpers: não precisam de EXECUTE público
REVOKE ALL ON FUNCTION public.rda_work_session_events_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_work_sessions_enforce_refs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rda_work_session_events_enforce_refs() FROM PUBLIC;

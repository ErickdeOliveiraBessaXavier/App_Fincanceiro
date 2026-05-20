-- 1. Backfill: ensure every profile has a role
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'operador'::public.app_role
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id
);

-- 2. Anti-lockout: prevent removing the last admin
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_admin_count INTEGER;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'admin'::public.app_role)
     OR (TG_OP = 'UPDATE' AND OLD.role = 'admin'::public.app_role AND NEW.role <> 'admin'::public.app_role) THEN
    SELECT COUNT(*) INTO v_admin_count FROM public.user_roles WHERE role = 'admin'::public.app_role;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Não é possível remover o último administrador do sistema';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_admin_removal ON public.user_roles;
CREATE TRIGGER trg_prevent_last_admin_removal
BEFORE DELETE OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();

-- 3. Audit trail for role changes
DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
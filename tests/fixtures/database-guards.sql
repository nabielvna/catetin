CREATE FUNCTION activity_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.actor_user_id IS NULL
    AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'activity is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_no_update BEFORE UPDATE OR DELETE ON activity
FOR EACH ROW EXECUTE FUNCTION activity_immutable();

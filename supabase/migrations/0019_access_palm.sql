-- Lectores ZKTeco (SpeedFace): la palma es un método de ingreso más.
-- Va en su propio archivo porque un valor nuevo de enum no se puede usar
-- en la misma transacción en la que se crea.
alter type public.checkin_method add value if not exists 'palm';

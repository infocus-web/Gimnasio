-- Datos de ejemplo para arrancar (se pueden editar o borrar desde el panel)

insert into public.plans (name, description, price, duration_days, sort) values
  ('Mensual libre', 'Musculación y todas las clases, entrás cuando quieras', 35000, 30, 1),
  ('Trimestral libre', '3 meses con descuento', 95000, 90, 2),
  ('Semanal', 'Pase por 7 días', 12000, 7, 3);

insert into public.exercises (name, muscle_group, equipment, description) values
  ('Sentadilla con barra', 'Piernas', 'Barra', 'Pies al ancho de hombros, espalda neutra, bajar hasta paralelo.'),
  ('Prensa 45°', 'Piernas', 'Máquina', 'Empujar con talones, no bloquear rodillas arriba.'),
  ('Peso muerto rumano', 'Piernas', 'Barra', 'Cadera atrás, barra pegada a las piernas, espalda recta.'),
  ('Press de banca', 'Pecho', 'Barra', 'Escápulas juntas, bajar la barra al pecho controlado.'),
  ('Aperturas con mancuernas', 'Pecho', 'Mancuernas', 'Codos semiflexionados, abrir hasta estirar el pecho.'),
  ('Dominadas', 'Espalda', 'Barra fija', 'Agarre prono, subir hasta pasar el mentón.'),
  ('Remo con barra', 'Espalda', 'Barra', 'Torso inclinado, llevar la barra al ombligo.'),
  ('Jalón al pecho', 'Espalda', 'Polea', 'Llevar la barra a la parte alta del pecho.'),
  ('Press militar', 'Hombros', 'Barra', 'De pie, empujar la barra por encima de la cabeza.'),
  ('Elevaciones laterales', 'Hombros', 'Mancuernas', 'Subir hasta la altura de los hombros.'),
  ('Curl de bíceps', 'Brazos', 'Mancuernas', 'Codos fijos al costado del cuerpo.'),
  ('Extensión de tríceps en polea', 'Brazos', 'Polea', 'Codos fijos, extender completo.'),
  ('Plancha', 'Abdomen', 'Peso corporal', 'Cuerpo alineado, abdomen y glúteos apretados.'),
  ('Crunch abdominal', 'Abdomen', 'Peso corporal', 'Subir despegando escápulas, sin tirar del cuello.'),
  ('Bicicleta fija', 'Cardio', 'Máquina', 'Ritmo moderado, 15 a 30 minutos.');

with r as (
  insert into public.routines (name, description, goal, level, days_per_week)
  values ('Full body inicial', 'Rutina de adaptación para las primeras semanas', 'Adaptación general', 'principiante', 3)
  returning id
)
insert into public.routine_items (routine_id, day, exercise_id, sets, reps, rest_seconds, position)
select r.id, x.day, e.id, x.sets, x.reps, x.rest, x.pos
from r, (values
  (1, 'Sentadilla con barra', 3, '12', 90, 1),
  (1, 'Press de banca', 3, '10', 90, 2),
  (1, 'Jalón al pecho', 3, '12', 60, 3),
  (1, 'Plancha', 3, '30 seg', 45, 4),
  (2, 'Prensa 45°', 3, '12', 90, 1),
  (2, 'Press militar', 3, '10', 90, 2),
  (2, 'Remo con barra', 3, '10', 60, 3),
  (2, 'Crunch abdominal', 3, '15', 45, 4),
  (3, 'Peso muerto rumano', 3, '10', 90, 1),
  (3, 'Aperturas con mancuernas', 3, '12', 60, 2),
  (3, 'Curl de bíceps', 3, '12', 60, 3),
  (3, 'Extensión de tríceps en polea', 3, '12', 60, 4),
  (3, 'Bicicleta fija', 1, '20 min', 0, 5)
) as x(day, ex, sets, reps, rest, pos)
join public.exercises e on e.name = x.ex;

with a as (
  insert into public.activities (name, description, instructor, color, sort) values
    ('Musculación', 'Sala de musculación con asesoramiento', 'Profes de sala', '#84cc16', 1),
    ('Funcional', 'Entrenamiento funcional en grupo', 'A definir', '#f97316', 2),
    ('Spinning', 'Clase de ciclismo indoor con música', 'A definir', '#06b6d4', 3)
  returning id, name
)
insert into public.activity_schedule (activity_id, weekday, start_time, end_time, room)
select a.id, s.wd, s.st::time, s.et::time, s.room
from a join (values
  ('Funcional', 1, '08:00', '09:00', 'Salón 1'), ('Funcional', 3, '08:00', '09:00', 'Salón 1'),
  ('Funcional', 5, '08:00', '09:00', 'Salón 1'), ('Funcional', 2, '19:00', '20:00', 'Salón 1'),
  ('Funcional', 4, '19:00', '20:00', 'Salón 1'),
  ('Spinning', 1, '19:00', '19:45', 'Salón 2'), ('Spinning', 3, '19:00', '19:45', 'Salón 2'),
  ('Spinning', 6, '10:00', '10:45', 'Salón 2')
) as s(act, wd, st, et, room) on s.act = a.name;

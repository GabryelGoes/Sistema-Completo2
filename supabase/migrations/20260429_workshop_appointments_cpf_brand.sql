-- Agenda: CPF do cliente e marca do veículo no agendamento
ALTER TABLE workshop_appointments
  ADD COLUMN IF NOT EXISTS customer_cpf text,
  ADD COLUMN IF NOT EXISTS vehicle_brand text;

COMMENT ON COLUMN workshop_appointments.customer_cpf IS 'CPF/CNPJ informado no agendamento (opcional).';
COMMENT ON COLUMN workshop_appointments.vehicle_brand IS 'Marca/montadora do veículo (opcional).';

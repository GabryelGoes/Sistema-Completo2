-- Documentação: nova chave opcional em workshop_system_users.permissions (JSONB):
-- patio_approve_budget_items (boolean) — aprovar/reprovar serviços e peças no orçamento.
-- Sem a chave, o app trata como legado: mesmo efeito de patio_edit_budgets até o admin salvar um valor explícito.
COMMENT ON TABLE workshop_system_users IS 'Logins criados pelo admin. permissions (JSONB): full_access; access_home, access_reception, access_agenda, access_patio, access_laboratorio, access_settings, access_change_passwords, access_technicians; patio_delete_cards, patio_assign_technician, patio_edit_ficha, patio_edit_queixa, patio_edit_delivery_date, patio_edit_mileage, patio_edit_budgets, patio_approve_budget_items, patio_add_comments, patio_archive_card.';

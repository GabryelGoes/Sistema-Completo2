import "dotenv/config";
import express from "express";
import multer from "multer";
import { supabaseAdmin, VEHICLE_PHOTOS_BUCKET } from "./supabaseClient.js";
import { FIRST_STAGE, ALL_STATUSES } from "./constants/serviceOrderStages.js";

export function createApiApp() {
  const app = express();
  const WORKSHOP_ID = process.env.WORKSHOP_ID;
  app.use(express.json());

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  if (!WORKSHOP_ID) {
    console.warn(
      "[Config] WORKSHOP_ID não definido. Defina no .env para filtrar dados por oficina."
    );
  }

  // ----------------- HEALTHCHECK -----------------
  app.get("/api/health", async (_req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({
          ok: false,
          error: "Supabase não configurado (verifique variáveis de ambiente).",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("workshops")
        .select("id, name")
        .limit(1);

      if (error) {
        console.error("[Supabase] Erro no healthcheck:", error);
        return res.status(500).json({ ok: false, error: error.message });
      }

      return res.json({
        ok: true,
        workshopSample: data?.[0] ?? null,
      });
    } catch (err: any) {
      console.error("[API] Erro no healthcheck:", err);
      return res.status(500).json({
        ok: false,
        error: err?.message ?? "Erro desconhecido",
      });
    }
  });

  // ----------------- AUTENTICAÇÃO -----------------
  const DEFAULT_ADMIN_PASSWORD = "Re1do@bs";
  const DEFAULT_PATIO_PIN = "4366";

  app.post("/api/auth/admin", async (req, res) => {
    try {
      const { password } = req.body || {};
      let expectedAdmin = "";
      if (supabaseAdmin && WORKSHOP_ID) {
        const { data: row, error } = await supabaseAdmin
          .from("workshop_settings")
          .select("value")
          .eq("workshop_id", WORKSHOP_ID)
          .eq("key", "admin_password")
          .maybeSingle();
        const dbPassword = row?.value != null && String(row.value).trim() !== "" ? String(row.value).trim() : "";
        if (dbPassword) expectedAdmin = dbPassword;
      }
      if (!expectedAdmin) expectedAdmin = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
      if (String(password).trim() === expectedAdmin) {
        return res.json({ ok: true, role: "admin" });
      }
      return res.status(401).json({ error: "Senha incorreta." });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/auth/admin:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/auth/patio", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { technicianSlug, pin } = req.body || {};
      const slug = typeof technicianSlug === "string" ? technicianSlug.trim().toLowerCase() : "";
      if (!slug) {
        return res.status(400).json({ error: "Selecione o mecânico." });
      }

      const { data: settingsRows } = await supabaseAdmin
        .from("workshop_settings")
        .select("key, value")
        .eq("workshop_id", WORKSHOP_ID)
        .in("key", ["patio_login_enabled", "patio_pin"]);

      const map = (settingsRows || []).reduce((acc: Record<string, string>, r: { key: string; value: string | null }) => {
        acc[r.key] = r.value ?? "";
        return acc;
      }, {});
      const enabled = map.patio_login_enabled !== "false";
      const expectedPin = map.patio_pin || DEFAULT_PATIO_PIN;

      if (!enabled) {
        return res.status(403).json({ error: "Login do pátio está desativado. Contate o administrador." });
      }
      if (expectedPin && String(pin || "") !== expectedPin) {
        return res.status(401).json({ error: "PIN incorreto." });
      }

      const { data: tech } = await supabaseAdmin
        .from("workshop_technicians")
        .select("id, slug, name")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("slug", slug)
        .single();

      if (!tech) {
        return res.status(404).json({ error: "Mecânico não encontrado." });
      }

      return res.json({ ok: true, role: "patio", technician: { id: tech.id, slug: tech.slug, name: tech.name } });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/auth/patio:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- CONFIGURAÇÕES DA OFICINA (login pátio) -----------------
  app.get("/api/workshop-settings", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { data } = await supabaseAdmin
        .from("workshop_settings")
        .select("key, value")
        .eq("workshop_id", WORKSHOP_ID);

      const map = (data || []).reduce((acc: Record<string, string>, r: { key: string; value: string | null }) => {
        acc[r.key] = r.value ?? "";
        return acc;
      }, {});
      return res.json({
        patioLoginEnabled: map.patio_login_enabled !== "false",
        patioPin: map.patio_pin || DEFAULT_PATIO_PIN,
        technicianAccessReception: map.technician_access_reception === "true",
        technicianAccessAgenda: map.technician_access_agenda === "true",
        technicianAccessPatio: map.technician_access_patio !== "false",
        adminDisplayName: map.admin_display_name || "Rei do ABS",
        adminPhotoUrl: map.admin_photo_url || null,
        vehicleDeletePassword: map.vehicle_delete_password || "",
      });
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-settings:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/workshop-settings", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { patioLoginEnabled, patioPin, adminPassword, adminDisplayName, adminPhotoUrl, technicianAccessReception, technicianAccessAgenda, technicianAccessPatio, vehicleDeletePassword } = req.body || {};
      const updates: { key: string; value: string; updated_at: string }[] = [];
      if (typeof patioLoginEnabled === "boolean") {
        updates.push({ key: "patio_login_enabled", value: String(patioLoginEnabled), updated_at: new Date().toISOString() });
      }
      if (typeof patioPin === "string") {
        updates.push({ key: "patio_pin", value: patioPin.trim(), updated_at: new Date().toISOString() });
      }
      if (typeof adminPassword === "string" && adminPassword.trim()) {
        updates.push({ key: "admin_password", value: adminPassword.trim(), updated_at: new Date().toISOString() });
      }
      if (typeof adminDisplayName === "string") {
        updates.push({ key: "admin_display_name", value: adminDisplayName.trim() || "Rei do ABS", updated_at: new Date().toISOString() });
      }
      if (typeof adminPhotoUrl === "string") {
        updates.push({ key: "admin_photo_url", value: adminPhotoUrl.trim(), updated_at: new Date().toISOString() });
      }
      if (typeof technicianAccessReception === "boolean") {
        updates.push({ key: "technician_access_reception", value: String(technicianAccessReception), updated_at: new Date().toISOString() });
      }
      if (typeof technicianAccessAgenda === "boolean") {
        updates.push({ key: "technician_access_agenda", value: String(technicianAccessAgenda), updated_at: new Date().toISOString() });
      }
      if (typeof technicianAccessPatio === "boolean") {
        updates.push({ key: "technician_access_patio", value: String(technicianAccessPatio), updated_at: new Date().toISOString() });
      }
      if (typeof vehicleDeletePassword === "string") {
        updates.push({ key: "vehicle_delete_password", value: vehicleDeletePassword.trim(), updated_at: new Date().toISOString() });
      }
      if (updates.length === 0) {
        return res.status(400).json({ error: "Nada para atualizar." });
      }
      for (const u of updates) {
        const { error: upsertErr } = await supabaseAdmin.from("workshop_settings").upsert(
          { workshop_id: WORKSHOP_ID, key: u.key, value: u.value, updated_at: u.updated_at },
          { onConflict: "workshop_id,key" }
        );
        if (upsertErr) {
          console.error("[API] Erro ao salvar workshop_settings:", u.key, upsertErr);
          return res.status(500).json({ error: "Falha ao salvar configuração. Tente novamente." });
        }
      }
      const { data } = await supabaseAdmin
        .from("workshop_settings")
        .select("key, value")
        .eq("workshop_id", WORKSHOP_ID)
        .in("key", ["patio_login_enabled", "patio_pin", "technician_access_reception", "technician_access_agenda", "technician_access_patio", "admin_display_name", "admin_photo_url", "vehicle_delete_password"]);
      const map = (data || []).reduce((acc: Record<string, string>, r: { key: string; value: string | null }) => {
        acc[r.key] = r.value ?? "";
        return acc;
      }, {});
      return res.json({
        patioLoginEnabled: map.patio_login_enabled !== "false",
        patioPin: map.patio_pin || "",
        technicianAccessReception: map.technician_access_reception === "true",
        technicianAccessAgenda: map.technician_access_agenda === "true",
        technicianAccessPatio: map.technician_access_patio !== "false",
        adminDisplayName: map.admin_display_name || "Rei do ABS",
        adminPhotoUrl: map.admin_photo_url || null,
        vehicleDeletePassword: map.vehicle_delete_password || "",
      });
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/workshop-settings:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- CLIENTES -----------------
  app.get("/api/customers", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("customers")
        .select(
          "id, name, cpf, phone, email, cep, address, address_number, created_at"
        )
        .eq("workshop_id", WORKSHOP_ID)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[API] Erro ao listar clientes:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em GET /api/customers:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { name, cpf, phone, email, cep, address, addressNumber } = req.body;

      if (!name || !phone) {
        return res
          .status(400)
          .json({ error: "Campos obrigatórios: name, phone." });
      }

      const { data, error } = await supabaseAdmin
        .from("customers")
        .insert({
          workshop_id: WORKSHOP_ID,
          name,
          cpf: cpf ?? null,
          phone,
          email: email ?? null,
          cep: cep ?? null,
          address: address ?? null,
          address_number: addressNumber ?? null,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[API] Erro ao criar cliente:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em POST /api/customers:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.patch("/api/customers/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error: "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { id } = req.params;
      const { name, cpf, phone, email, cep, address, addressNumber } = req.body;
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = String(name).trim();
      if (cpf !== undefined) updates.cpf = cpf == null || String(cpf).trim() === "" ? null : String(cpf).trim();
      if (phone !== undefined) updates.phone = String(phone).trim();
      if (email !== undefined) updates.email = email == null || String(email).trim() === "" ? null : String(email).trim();
      if (cep !== undefined) updates.cep = cep == null || String(cep).trim() === "" ? null : String(cep).trim();
      if (address !== undefined) updates.address = address == null || String(address).trim() === "" ? null : String(address).trim();
      if (addressNumber !== undefined) updates.address_number = addressNumber == null || String(addressNumber).trim() === "" ? null : String(addressNumber).trim();
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Nada para atualizar." });
      }
      const { data, error } = await supabaseAdmin
        .from("customers")
        .update(updates)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();
      if (error) {
        console.error("[API] Erro ao atualizar cliente:", error);
        return res.status(500).json({ error: error.message });
      }
      if (!data) return res.status(404).json({ error: "Cliente não encontrado." });
      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em PATCH /api/customers/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- AGENDA (workshop_appointments) -----------------
  app.get("/api/appointments", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error: "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_appointments")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true });

      if (error) {
        console.error("[API] Erro ao listar agendamentos:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro inesperado em GET /api/appointments:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/appointments", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error: "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const {
        title,
        customerName,
        phone,
        email,
        vehicleModel,
        plate,
        notes,
        date,
        time,
        status,
        trelloCardId,
      } = req.body;

      const scheduledDate = typeof date === "string" ? date.slice(0, 10) : null;
      if (!scheduledDate) {
        return res.status(400).json({ error: "Campo obrigatório: date (YYYY-MM-DD)." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_appointments")
        .insert({
          workshop_id: WORKSHOP_ID,
          title: title ?? "",
          customer_name: customerName ?? "",
          phone: phone ?? null,
          email: email ?? null,
          vehicle_model: vehicleModel ?? "",
          plate: (plate ?? "").toString().toUpperCase(),
          notes: notes ?? null,
          scheduled_date: scheduledDate,
          scheduled_time: (time ?? "09:00").toString(),
          status: status ?? "scheduled",
          trello_card_id: trelloCardId ?? null,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) {
        console.error("[API] Erro ao criar agendamento:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em POST /api/appointments:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.patch("/api/appointments/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error: "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { id } = req.params;
      const {
        title,
        customerName,
        phone,
        email,
        vehicleModel,
        plate,
        notes,
        date,
        time,
        status,
        trelloCardId,
      } = req.body;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (title !== undefined) updates.title = title;
      if (customerName !== undefined) updates.customer_name = customerName;
      if (phone !== undefined) updates.phone = phone;
      if (email !== undefined) updates.email = email;
      if (vehicleModel !== undefined) updates.vehicle_model = vehicleModel;
      if (plate !== undefined) updates.plate = String(plate).toUpperCase();
      if (notes !== undefined) updates.notes = notes;
      if (date !== undefined) updates.scheduled_date = String(date).slice(0, 10);
      if (time !== undefined) updates.scheduled_time = String(time);
      if (status !== undefined) updates.status = status;
      if (trelloCardId !== undefined) updates.trello_card_id = trelloCardId;

      const { data, error } = await supabaseAdmin
        .from("workshop_appointments")
        .update(updates)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();

      if (error) {
        console.error("[API] Erro ao atualizar agendamento:", error);
        return res.status(500).json({ error: error.message });
      }
      if (!data) {
        return res.status(404).json({ error: "Agendamento não encontrado." });
      }
      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em PATCH /api/appointments/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/appointments/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error: "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { id } = req.params;
      const { error } = await supabaseAdmin
        .from("workshop_appointments")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);

      if (error) {
        console.error("[API] Erro ao excluir agendamento:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro inesperado em DELETE /api/appointments/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- ORDENS DE SERVIÇO -----------------
  app.get("/api/service-orders", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const status = req.query.status as string | undefined;

      let query = supabaseAdmin
        .from("service_orders")
        .select(
          "id, customer_id, vehicle_model, plate, mileage_km, delivery_date, issue_description, ai_analysis, status, assigned_technician, garantia_tag, created_at, updated_at, customers(id, name, phone)"
        )
        .eq("workshop_id", WORKSHOP_ID)
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[API] Erro ao listar service_orders:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em GET /api/service-orders:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/service-orders", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const {
        customerId,
        vehicleModel,
        plate,
        mileageKm,
        issueDescription,
        aiAnalysis,
      } = req.body;

      if (!customerId || !vehicleModel || !plate) {
        return res.status(400).json({
          error: "Campos obrigatórios: customerId, vehicleModel, plate.",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .insert({
          workshop_id: WORKSHOP_ID,
          customer_id: customerId,
          vehicle_model: vehicleModel,
          plate: String(plate || '').toUpperCase(),
          mileage_km: mileageKm != null && String(mileageKm).trim() !== '' ? String(mileageKm).trim() : null,
          issue_description: issueDescription ?? null,
          ai_analysis: aiAnalysis ?? null,
          status: FIRST_STAGE,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[API] Erro ao criar service_order:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em POST /api/service-orders:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Upload de fotos vinculadas a uma OS (armazenadas no Storage do Supabase)
  app.post(
    "/api/service-orders/:id/photos",
    upload.single("file"),
    async (req, res) => {
      try {
        if (!supabaseAdmin || !WORKSHOP_ID) {
          return res.status(500).json({
            error:
              "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
          });
        }

        const serviceOrderId = req.params.id;
        const file = req.file;

        if (!file) {
          return res.status(400).json({ error: "Arquivo não enviado." });
        }

        // Garante que a OS pertence à oficina
        const { data: serviceOrder, error: soError } = await supabaseAdmin
          .from("service_orders")
          .select("id, workshop_id")
          .eq("id", serviceOrderId)
          .single();

        if (soError || !serviceOrder || serviceOrder.workshop_id !== WORKSHOP_ID) {
          return res.status(404).json({ error: "Ordem de serviço não encontrada." });
        }

        const bucket = VEHICLE_PHOTOS_BUCKET;
        const safeName = file.originalname.replace(/\s+/g, "_");
        const pathInBucket = `${WORKSHOP_ID}/${serviceOrderId}/${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from(bucket)
          .upload(pathInBucket, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          console.error("[API] Erro ao enviar foto para Storage:", uploadError);
          return res.status(500).json({ error: uploadError.message });
        }

        const {
          data: { publicUrl },
        } = supabaseAdmin.storage.from(bucket).getPublicUrl(pathInBucket);

        return res.status(201).json({
          url: publicUrl,
          path: pathInBucket,
        });
      } catch (err: any) {
        console.error(
          "[API] Erro inesperado em POST /api/service-orders/:id/photos:",
          err
        );
        return res
          .status(500)
          .json({ error: err?.message ?? "Erro desconhecido" });
      }
    }
  );

  // Detalhe de uma OS (com cliente completo para "Usar na Recepção")
  app.get("/api/service-orders/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;

      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .select("*, customers(*)")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/service-orders/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Listar fotos de uma OS (Storage)
  app.get("/api/service-orders/:id/photos", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId } = req.params;

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const folderPath = `${WORKSHOP_ID}/${serviceOrderId}`;
      const bucket = VEHICLE_PHOTOS_BUCKET;
      const { data: files, error } = await supabaseAdmin.storage
        .from(bucket)
        .list(folderPath, { limit: 100 });

      if (error) {
        console.error("[API] Erro ao listar fotos:", error);
        return res.json([]);
      }

      const photos = (files || [])
        .filter((f) => f.name && !f.name.endsWith("/"))
        .map((f) => {
          const pathInBucket = `${folderPath}/${f.name}`;
          const { data: { publicUrl } } = supabaseAdmin.storage
            .from(bucket)
            .getPublicUrl(pathInBucket);
          return { url: publicUrl, name: f.name, path: pathInBucket };
        });

      return res.json(photos);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/service-orders/:id/photos:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Listar orçamentos de uma OS
  app.get("/api/service-orders/:id/budgets", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId } = req.params;

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const { data, error } = await supabaseAdmin
        .from("budgets")
        .select("id, service_order_id, card_name, diagnosis, services, parts, observations, created_at")
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[API] Erro ao listar orçamentos:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/service-orders/:id/budgets:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Criar orçamento para uma OS
  app.post("/api/service-orders/:id/budgets", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId } = req.params;
      const { cardName, diagnosis, services, parts, observations, actor, actorTechnicianSlug, actorTechnicianName } = req.body;

      const { data: so, error: soError } = await supabaseAdmin
        .from("service_orders")
        .select("id, plate, vehicle_model, customers(name)")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (soError || !so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const customerNameBudget = so.customers && typeof so.customers === "object" && "name" in so.customers
        ? String((so.customers as { name: string }).name ?? "")
        : "";

      const payload = {
        workshop_id: WORKSHOP_ID,
        service_order_id: serviceOrderId,
        card_name: cardName ?? null,
        diagnosis: typeof diagnosis === "string" ? diagnosis : "",
        services: Array.isArray(services) ? services : [],
        parts: Array.isArray(parts) ? parts : [],
        observations: typeof observations === "string" ? observations : "",
      };

      const { data, error } = await supabaseAdmin
        .from("budgets")
        .insert(payload)
        .select("id, service_order_id, card_name, diagnosis, services, parts, observations, created_at")
        .single();

      if (error) {
        console.error("[API] Erro ao criar orçamento:", error);
        return res.status(500).json({ error: error.message });
      }

      const isTechnicianActor = actor === "technician" && (typeof actorTechnicianSlug === "string" || typeof actorTechnicianName === "string");
      if (isTechnicianActor) {
        const technicianLabel = typeof actorTechnicianName === "string" && actorTechnicianName.trim() ? actorTechnicianName.trim() : (actorTechnicianSlug || "Técnico");
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "budget_created",
          payload: {
            service_order_id: serviceOrderId,
            vehicle_plate: so?.plate ?? null,
            vehicle_model: so?.vehicle_model ?? null,
            customer_name: customerNameBudget || null,
            technician_name: technicianLabel,
          },
          target_type: "admin",
          target_slug: null,
        }).then(({ error: e }) => { if (e) console.error("[API] Notificação budget_created:", e); });
      }

      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/service-orders/:id/budgets:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Atualizar orçamento
  app.put("/api/service-orders/:id/budgets/:budgetId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId, budgetId } = req.params;
      const { cardName, diagnosis, services, parts, observations, actor, actorTechnicianSlug, actorTechnicianName } = req.body;

      const { data: so, error: soError } = await supabaseAdmin
        .from("service_orders")
        .select("id, plate, vehicle_model, customers(name)")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (soError || !so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const customerNameBudgetEdit = so.customers && typeof so.customers === "object" && "name" in so.customers
        ? String((so.customers as { name: string }).name ?? "")
        : "";

      const updatePayload: Record<string, unknown> = {
        card_name: cardName ?? null,
        diagnosis: typeof diagnosis === "string" ? diagnosis : "",
        services: Array.isArray(services) ? services : [],
        parts: Array.isArray(parts) ? parts : [],
        observations: typeof observations === "string" ? observations : "",
      };

      const { data, error } = await supabaseAdmin
        .from("budgets")
        .update(updatePayload)
        .eq("id", budgetId)
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, service_order_id, card_name, diagnosis, services, parts, observations, created_at")
        .single();

      if (error) {
        console.error("[API] Erro ao atualizar orçamento:", error);
        return res.status(500).json({ error: error.message });
      }

      if (!data) {
        return res.status(404).json({ error: "Orçamento não encontrado." });
      }

      const isTechnicianActor = actor === "technician" && (typeof actorTechnicianSlug === "string" || typeof actorTechnicianName === "string");
      if (isTechnicianActor) {
        const technicianLabel = typeof actorTechnicianName === "string" && actorTechnicianName.trim() ? actorTechnicianName.trim() : (actorTechnicianSlug || "Técnico");
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "budget_edited",
          payload: {
            service_order_id: serviceOrderId,
            vehicle_plate: so?.plate ?? null,
            vehicle_model: so?.vehicle_model ?? null,
            customer_name: customerNameBudgetEdit || null,
            technician_name: technicianLabel,
          },
          target_type: "admin",
          target_slug: null,
        }).then(({ error: e }) => { if (e) console.error("[API] Notificação budget_edited:", e); });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/service-orders/:id/budgets/:budgetId:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Excluir orçamento
  app.delete("/api/service-orders/:id/budgets/:budgetId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId, budgetId } = req.params;

      const { error } = await supabaseAdmin
        .from("budgets")
        .delete()
        .eq("id", budgetId)
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID);

      if (error) {
        console.error("[API] Erro ao excluir orçamento:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/service-orders/:id/budgets/:budgetId:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Comentários do modal do veículo (autor = "Rei do ABS" ou nome do técnico)
  app.get("/api/service-orders/:id/comments", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId } = req.params;

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const { data, error } = await supabaseAdmin
        .from("service_order_comments")
        .select("id, author_display_name, text, created_at")
        .eq("service_order_id", serviceOrderId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[API] Erro ao listar comentários:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/service-orders/:id/comments:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/service-orders/:id/comments", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId } = req.params;
      const { text, authorDisplayName } = req.body;

      if (typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Campo text é obrigatório." });
      }

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id, plate, vehicle_model, assigned_technician, customers(name)")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const author = typeof authorDisplayName === "string" && authorDisplayName.trim()
        ? authorDisplayName.trim()
        : "Usuário";

      const { data, error } = await supabaseAdmin
        .from("service_order_comments")
        .insert({
          service_order_id: serviceOrderId,
          author_display_name: author,
          text: text.trim(),
        })
        .select("id, author_display_name, text, created_at")
        .single();

      if (error) {
        console.error("[API] Erro ao criar comentário:", error);
        return res.status(500).json({ error: error.message });
      }

      const customerName = so.customers && typeof so.customers === "object" && "name" in so.customers
        ? String((so.customers as { name: string }).name ?? "")
        : "";
      const isAdminComment = /rei\s*do\s*abs/i.test(author);
      let authorPhotoUrl: string | null = null;
      if (isAdminComment) {
        const { data: setting } = await supabaseAdmin
          .from("workshop_settings")
          .select("value")
          .eq("workshop_id", WORKSHOP_ID)
          .eq("key", "admin_photo_url")
          .maybeSingle();
        authorPhotoUrl = setting?.value?.trim() || null;
      } else {
        const authorTrim = author.trim();
        const { data: techs } = await supabaseAdmin
          .from("workshop_technicians")
          .select("photo_url, name")
          .eq("workshop_id", WORKSHOP_ID)
          .limit(50);
        const tech = (techs ?? []).find((t) => (t.name?.trim() === authorTrim) || (String(t.name).trim().toLowerCase() === authorTrim.toLowerCase()));
        authorPhotoUrl = tech?.photo_url?.trim() || null;
      }
      const commentPayload = {
        service_order_id: serviceOrderId,
        comment_id: data.id,
        author_display_name: author,
        author_photo_url: authorPhotoUrl,
        text: text.trim(),
        vehicle_plate: so.plate ?? null,
        vehicle_model: so.vehicle_model ?? null,
        customer_name: customerName || null,
      };

      // Admin só recebe notificação de comentários feitos por técnicos (não dos seus próprios)
      if (!isAdminComment) {
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "comment",
          payload: commentPayload,
          target_type: "admin",
          target_slug: null,
        }).then(({ error: notifErr }) => { if (notifErr) console.error("[API] Erro ao criar notificação de comentário (admin):", notifErr); });
      }
      if (isAdminComment && so.assigned_technician) {
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "comment",
          payload: commentPayload,
          target_type: "technician",
          target_slug: so.assigned_technician,
        }).then(({ error: notifErr }) => { if (notifErr) console.error("[API] Erro ao criar notificação de comentário (técnico):", notifErr); });
      }

      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/service-orders/:id/comments:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- CENTRAL DE NOTIFICAÇÕES (admin) -----------------
  app.post("/api/notifications", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { type, payload, targetType, targetSlug } = req.body || {};
      if (typeof type !== "string" || !type.trim()) {
        return res.status(400).json({ error: "Campo type é obrigatório." });
      }
      const target_type = targetType === "technician" && typeof targetSlug === "string" && targetSlug.trim() ? "technician" : "admin";
      const target_slug = target_type === "technician" ? targetSlug.trim() : null;
      const { data, error } = await supabaseAdmin
        .from("notifications")
        .insert({
          workshop_id: WORKSHOP_ID,
          type: type.trim(),
          payload: payload && typeof payload === "object" ? payload : {},
          target_type,
          target_slug,
        })
        .select("id, type, payload, read_at, created_at")
        .single();
      if (error) {
        console.error("[API] Erro ao criar notificação:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/notifications:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.get("/api/notifications", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const forWho = (req.query.for as string) || "admin";
      const technicianSlug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const since = req.query.since as string | undefined;

      let query = supabaseAdmin
        .from("notifications")
        .select("id, type, payload, read_at, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (forWho === "technician" && technicianSlug) {
        query = query.eq("target_type", "technician").eq("target_slug", technicianSlug);
      } else {
        query = query.or("target_type.eq.admin,target_type.is.null");
      }
      if (since) {
        query = query.gt("created_at", since);
      }
      const { data, error } = await query;
      if (error) {
        console.error("[API] Erro em GET /api/notifications:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/notifications:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const forWho = (req.query.for as string) || "admin";
      const technicianSlug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
      let query = supabaseAdmin
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("workshop_id", WORKSHOP_ID)
        .is("read_at", null);
      if (forWho === "technician" && technicianSlug) {
        query = query.eq("target_type", "technician").eq("target_slug", technicianSlug);
      } else {
        query = query.or("target_type.eq.admin,target_type.is.null");
      }
      const { count, error } = await query;
      if (error) {
        console.error("[API] Erro em GET /api/notifications/unread-count:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json({ count: count ?? 0 });
    } catch (err: any) {
      console.error("[API] Erro em GET /api/notifications/unread-count:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { id } = req.params;
      const forWho = (req.query.for as string) || "admin";
      const technicianSlug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
      let updateQuery = supabaseAdmin
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);
      if (forWho === "technician" && technicianSlug) {
        updateQuery = updateQuery.eq("target_type", "technician").eq("target_slug", technicianSlug);
      } else {
        updateQuery = updateQuery.or("target_type.eq.admin,target_type.is.null");
      }
      const { error } = await updateQuery;
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em PATCH /api/notifications/:id/read:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/notifications/read-all", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const forWho = (req.body?.for ?? req.query.for) === "technician" ? "technician" : "admin";
      const technicianSlug = typeof (req.body?.slug ?? req.query.slug) === "string" ? String(req.body?.slug ?? req.query.slug).trim() : "";
      let updateQuery = supabaseAdmin
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("workshop_id", WORKSHOP_ID)
        .is("read_at", null);
      if (forWho === "technician" && technicianSlug) {
        updateQuery = updateQuery.eq("target_type", "technician").eq("target_slug", technicianSlug);
      } else {
        updateQuery = updateQuery.or("target_type.eq.admin,target_type.is.null");
      }
      const { error } = await updateQuery;
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em POST /api/notifications/read-all:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/notifications", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const forWho = (req.query.for as string) || "admin";
      const technicianSlug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";

      if (forWho === "technician" && technicianSlug) {
        const { error } = await supabaseAdmin
          .from("notifications")
          .delete()
          .eq("workshop_id", WORKSHOP_ID)
          .eq("target_type", "technician")
          .eq("target_slug", technicianSlug);
        if (error) {
          console.error("[API] Erro em DELETE /api/notifications (technician):", error);
          return res.status(500).json({ error: error.message });
        }
        return res.status(204).send();
      }

      const { error: errAdmin } = await supabaseAdmin
        .from("notifications")
        .delete()
        .eq("workshop_id", WORKSHOP_ID)
        .eq("target_type", "admin");
      if (errAdmin) {
        console.error("[API] Erro em DELETE /api/notifications (admin):", errAdmin);
        return res.status(500).json({ error: errAdmin.message });
      }
      const { error: errNull } = await supabaseAdmin
        .from("notifications")
        .delete()
        .eq("workshop_id", WORKSHOP_ID)
        .is("target_type", null);
      if (errNull) {
        console.error("[API] Erro em DELETE /api/notifications (null):", errNull);
        return res.status(500).json({ error: errNull.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/notifications:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- SERVIÇOS DA OFICINA (para orçamentos) -----------------
  app.get("/api/workshop-services", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_services")
        .select("id, name, sort_order, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error("[API] Erro ao listar serviços da oficina:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-services:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/workshop-services", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { name } = req.body;
      const trimmed = typeof name === "string" ? name.trim() : "";

      if (!trimmed) {
        return res.status(400).json({ error: "Nome do serviço é obrigatório." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_services")
        .insert({
          workshop_id: WORKSHOP_ID,
          name: trimmed,
          sort_order: 0,
        })
        .select("id, name, sort_order, created_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe um serviço com este nome." });
        }
        console.error("[API] Erro ao criar serviço:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop-services:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/workshop-services/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;
      const { name } = req.body;
      const trimmed = typeof name === "string" ? name.trim() : "";

      if (!trimmed) {
        return res.status(400).json({ error: "Nome do serviço é obrigatório." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_services")
        .update({ name: trimmed })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, name, sort_order, created_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe um serviço com este nome." });
        }
        console.error("[API] Erro ao atualizar serviço:", error);
        return res.status(500).json({ error: error.message });
      }

      if (!data) {
        return res.status(404).json({ error: "Serviço não encontrado." });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/workshop-services/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/workshop-services/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;

      const { error } = await supabaseAdmin
        .from("workshop_services")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);

      if (error) {
        console.error("[API] Erro ao excluir serviço:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/workshop-services/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- TÉCNICOS DA OFICINA (atribuição nos cards) -----------------
  const capitalizeTechnicianName = (s: string) =>
    (s || "").trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

  app.get("/api/workshop-technicians", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_technicians")
        .select("id, slug, name, color_style, sort_order, photo_url, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error("[API] Erro ao listar técnicos:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-technicians:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/workshop-technicians", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { slug, name, color_style } = req.body;
      const slugTrimmed = typeof slug === "string" ? String(slug).trim().toLowerCase().replace(/\s+/g, "_") : "";
      const nameTrimmed = typeof name === "string" ? name.trim() : "";
      const color = typeof color_style === "string" && color_style.trim() ? color_style.trim().toLowerCase() : null;

      if (!slugTrimmed) {
        return res.status(400).json({ error: "Identificador (slug) do técnico é obrigatório." });
      }
      if (!nameTrimmed) {
        return res.status(400).json({ error: "Nome do técnico é obrigatório." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_technicians")
        .insert({
          workshop_id: WORKSHOP_ID,
          slug: slugTrimmed,
          name: capitalizeTechnicianName(nameTrimmed),
          color_style: color,
          sort_order: 0,
        })
        .select("id, slug, name, color_style, sort_order, photo_url, created_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe um técnico com este identificador." });
        }
        console.error("[API] Erro ao criar técnico:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop-technicians:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/workshop-technicians/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;
      const { slug, name, color_style } = req.body;
      const slugTrimmed = typeof slug === "string" ? String(slug).trim().toLowerCase().replace(/\s+/g, "_") : undefined;
      const nameTrimmed = typeof name === "string" ? name.trim() : undefined;
      const color = color_style !== undefined
        ? (typeof color_style === "string" && color_style.trim() ? color_style.trim().toLowerCase() : null)
        : undefined;

      const updatePayload: any = {};
      if (slugTrimmed !== undefined) updatePayload.slug = slugTrimmed;
      if (nameTrimmed !== undefined) updatePayload.name = capitalizeTechnicianName(nameTrimmed);
      if (color !== undefined) updatePayload.color_style = color;

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: "Nada para atualizar." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_technicians")
        .update(updatePayload)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, slug, name, color_style, sort_order, photo_url, created_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe um técnico com este identificador." });
        }
        console.error("[API] Erro ao atualizar técnico:", error);
        return res.status(500).json({ error: error.message });
      }

      if (!data) {
        return res.status(404).json({ error: "Técnico não encontrado." });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/workshop-technicians/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/workshop-technicians/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;

      const { error } = await supabaseAdmin
        .from("workshop_technicians")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);

      if (error) {
        console.error("[API] Erro ao excluir técnico:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/workshop-technicians/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Upload da foto do técnico (arquivo ou câmera)
  app.post(
    "/api/workshop-technicians/:id/photo",
    upload.single("file"),
    async (req, res) => {
      try {
        if (!supabaseAdmin || !WORKSHOP_ID) {
          return res.status(500).json({
            error:
              "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
          });
        }

        const { id: technicianId } = req.params;
        const file = req.file;

        if (!file) {
          return res.status(400).json({ error: "Arquivo de imagem não enviado." });
        }

        const { data: tech, error: techError } = await supabaseAdmin
          .from("workshop_technicians")
          .select("id")
          .eq("id", technicianId)
          .eq("workshop_id", WORKSHOP_ID)
          .single();

        if (techError || !tech) {
          return res.status(404).json({ error: "Técnico não encontrado." });
        }

        const bucket = VEHICLE_PHOTOS_BUCKET;
        const ext = (file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") ? "jpg" : file.mimetype === "image/png" ? "png" : "webp";
        const pathInBucket = `${WORKSHOP_ID}/technicians/${technicianId}/photo.${ext}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from(bucket)
          .upload(pathInBucket, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });

        if (uploadError) {
          console.error("[API] Erro ao enviar foto do técnico:", uploadError);
          return res.status(500).json({ error: uploadError.message });
        }

        const {
          data: { publicUrl },
        } = supabaseAdmin.storage.from(bucket).getPublicUrl(pathInBucket);
        const photoUrlWithCacheBust = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;

        const { data: updated, error: updateError } = await supabaseAdmin
          .from("workshop_technicians")
          .update({ photo_url: photoUrlWithCacheBust })
          .eq("id", technicianId)
          .eq("workshop_id", WORKSHOP_ID)
          .select("id, slug, name, color_style, sort_order, photo_url, created_at")
          .single();

        if (updateError) {
          console.error("[API] Erro ao atualizar photo_url do técnico:", updateError);
          return res.status(500).json({ error: updateError.message });
        }

        return res.json(updated);
      } catch (err: any) {
        console.error("[API] Erro em POST /api/workshop-technicians/:id/photo:", err);
        return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
      }
    }
  );

  // Upload da foto do perfil do administrador
  app.post(
    "/api/workshop-admin/photo",
    upload.single("file"),
    async (req, res) => {
      try {
        if (!supabaseAdmin || !WORKSHOP_ID) {
          return res.status(500).json({
            error:
              "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
          });
        }
        const file = req.file;
        if (!file) {
          return res.status(400).json({ error: "Arquivo de imagem não enviado." });
        }
        const bucket = VEHICLE_PHOTOS_BUCKET;
        const ext = (file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") ? "jpg" : file.mimetype === "image/png" ? "png" : "webp";
        const pathInBucket = `${WORKSHOP_ID}/admin/photo.${ext}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from(bucket)
          .upload(pathInBucket, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });
        if (uploadError) {
          console.error("[API] Erro ao enviar foto do admin:", uploadError);
          return res.status(500).json({ error: uploadError.message });
        }
        const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(pathInBucket);
        const photoUrlWithCacheBust = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
        const { error: updateErr } = await supabaseAdmin.from("workshop_settings").upsert(
          { workshop_id: WORKSHOP_ID, key: "admin_photo_url", value: photoUrlWithCacheBust, updated_at: new Date().toISOString() },
          { onConflict: "workshop_id,key" }
        );
        if (updateErr) {
          console.error("[API] Erro ao atualizar admin_photo_url:", updateErr);
          return res.status(500).json({ error: updateErr.message });
        }
        return res.json({ adminPhotoUrl: photoUrlWithCacheBust });
      } catch (err: any) {
        console.error("[API] Erro em POST /api/workshop-admin/photo:", err);
        return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
      }
    }
  );

  app.put("/api/service-orders/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;
      const { status, issueDescription, aiAnalysis, assignedTechnician, garantiaTag, mileageKm, deliveryDate, vehicleModel, plate, actor, actorTechnicianSlug, actorTechnicianName } = req.body;
      const isAdminActor = actor !== "technician";

      const updatePayload: any = {};
      if (vehicleModel !== undefined) {
        updatePayload.vehicle_model = typeof vehicleModel === "string" ? vehicleModel.trim() : "";
      }
      if (plate !== undefined) {
        updatePayload.plate = typeof plate === "string" ? String(plate).trim().toUpperCase() : "";
      }
      if (mileageKm !== undefined) {
        updatePayload.mileage_km = mileageKm == null || String(mileageKm).trim() === '' ? null : String(mileageKm).trim();
      }
      if (deliveryDate !== undefined) {
        updatePayload.delivery_date = deliveryDate == null || String(deliveryDate).trim() === '' ? null : String(deliveryDate).trim();
      }
      if (status !== undefined) {
        if (!ALL_STATUSES.includes(status)) {
          return res.status(400).json({ error: "Status inválido." });
        }
        updatePayload.status = status;
        if (status === "GARANTIA") {
          updatePayload.garantia_tag = true;
        }
      }
      if (issueDescription !== undefined)
        updatePayload.issue_description = issueDescription;
      if (aiAnalysis !== undefined) updatePayload.ai_analysis = aiAnalysis;
      if (assignedTechnician !== undefined) {
        if (assignedTechnician === null || assignedTechnician === "") {
          updatePayload.assigned_technician = null;
        } else {
          const { data: techList } = await supabaseAdmin
            .from("workshop_technicians")
            .select("slug")
            .eq("workshop_id", WORKSHOP_ID);
          const allowed = (techList ?? []).map((t: { slug: string }) => t.slug);
          if (allowed.includes(assignedTechnician)) {
            updatePayload.assigned_technician = assignedTechnician;
          } else {
            return res.status(400).json({ error: "Técnico inválido. Cadastre o técnico em Técnicos na tela inicial." });
          }
        }
      }
      if (garantiaTag === false) {
        updatePayload.garantia_tag = false;
      }

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: "Nada para atualizar." });
      }

      const { data: previous } = await supabaseAdmin
        .from("service_orders")
        .select("status, issue_description, delivery_date, assigned_technician, plate, vehicle_model, customers(name)")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      updatePayload.updated_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .update(updatePayload)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();

      if (error) {
        console.error("[API] Erro ao atualizar service_order:", error);
        return res.status(500).json({ error: error.message });
      }

      const techSlug = data?.assigned_technician ?? null;
      const customerNameSo = previous?.customers && typeof previous.customers === "object" && "name" in previous.customers
        ? String((previous.customers as { name: string }).name ?? "")
        : "";
      const payloadBase = {
        service_order_id: id,
        vehicle_plate: data?.plate ?? previous?.plate ?? null,
        vehicle_model: data?.vehicle_model ?? previous?.vehicle_model ?? null,
        customer_name: customerNameSo || null,
      };
      if (previous) {
        if (isAdminActor && techSlug) {
          // Ações do admin: notificar apenas o técnico
          if (updatePayload.status !== undefined && previous.status !== data?.status) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "stage_change",
              payload: { ...payloadBase, new_status: data?.status },
              target_type: "technician",
              target_slug: techSlug,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação stage_change:", e); });
          }
          if (updatePayload.issue_description !== undefined && previous.issue_description !== data?.issue_description) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "complaint_edited",
              payload: payloadBase,
              target_type: "technician",
              target_slug: techSlug,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação complaint_edited:", e); });
          }
          if (updatePayload.delivery_date !== undefined && String(previous?.delivery_date ?? "") !== String(data?.delivery_date ?? "")) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "delivery_date_changed",
              payload: { ...payloadBase, delivery_date: data?.delivery_date ?? null },
              target_type: "technician",
              target_slug: techSlug,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação delivery_date_changed:", e); });
          }
        } else if (!isAdminActor && (typeof actorTechnicianSlug === "string" || typeof actorTechnicianName === "string")) {
          // Ações do técnico: notificar apenas o admin (Rei do ABS)
          const technicianLabel = typeof actorTechnicianName === "string" && actorTechnicianName.trim() ? actorTechnicianName.trim() : (actorTechnicianSlug || "Técnico");
          if (updatePayload.status !== undefined && previous.status !== data?.status) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "stage_change",
              payload: { ...payloadBase, new_status: data?.status, technician_name: technicianLabel },
              target_type: "admin",
              target_slug: null,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação stage_change (admin):", e); });
          }
          if (updatePayload.issue_description !== undefined && previous.issue_description !== data?.issue_description) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "complaint_edited",
              payload: { ...payloadBase, technician_name: technicianLabel },
              target_type: "admin",
              target_slug: null,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação complaint_edited (admin):", e); });
          }
          if (updatePayload.delivery_date !== undefined && String(previous?.delivery_date ?? "") !== String(data?.delivery_date ?? "")) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "delivery_date_changed",
              payload: { ...payloadBase, delivery_date: data?.delivery_date ?? null, technician_name: technicianLabel },
              target_type: "admin",
              target_slug: null,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação delivery_date_changed (admin):", e); });
          }
        }
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em PUT /api/service-orders/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Excluir veículo do sistema (arquivar como CANCELLED) — exige senha configurada em "Alterar senhas"
  app.post("/api/service-orders/:id/delete-with-password", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { id } = req.params;
      const { password } = req.body || {};
      const expected = await supabaseAdmin
        .from("workshop_settings")
        .select("value")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("key", "vehicle_delete_password")
        .maybeSingle();
      const expectedPassword = expected?.data?.value?.trim() ?? "";
      if (!expectedPassword) {
        return res.status(400).json({ error: "Configure a senha para excluir veículos em Alterar senhas (página inicial)." });
      }
      if (String(password).trim() !== expectedPassword) {
        return res.status(401).json({ error: "Senha incorreta." });
      }
      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id")
        .single();
      if (error || !data) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/service-orders/:id/delete-with-password:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  return app;
}

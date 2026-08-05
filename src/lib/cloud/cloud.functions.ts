// Server functions untuk Cloud Storage (Google Drive global / pribadi).
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getCloudStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getStorageMode, getConnectionKeyForUser, getConnectionInfoForUser, DRIVE_CONNECTOR_ID } =
      await import("./connections.server");
    const { getGlobalCloudRow } = await import("./global-cloud.server");
    const [mode, key, info, global] = await Promise.all([
      getStorageMode(context.userId),
      getConnectionKeyForUser(context.userId, DRIVE_CONNECTOR_ID),
      getConnectionInfoForUser(context.userId, DRIVE_CONNECTOR_ID),
      getGlobalCloudRow(),
    ]);

    // Info akun + kuota Drive pribadi (live dari Google).
    let personalEmail = info?.account_email ?? null;
    let quota: { limit: number | null; usage: number | null } | null = null;
    if (key) {
      const { driveAbout } = await import("./drive.server");
      const about = await driveAbout({ mode: "personal", connectionKey: key });
      if (about) {
        personalEmail = about.email ?? personalEmail;
        quota = { limit: about.limit, usage: about.usage };
      }
    }
    const personalFull = Boolean(quota?.limit != null && quota?.usage != null && quota.usage >= quota.limit);

    return {
      storageMode: mode,
      personalConnected: Boolean(key),
      accountEmail: personalEmail,
      personalQuota: quota,
      personalFull,
      globalAvailable: Boolean(
        global?.enabled &&
          (global.refresh_token_cipher || (process.env.GOOGLE_DRIVE_API_KEY && process.env.LOVABLE_API_KEY)),
      ),
    };
  });


export const setCloudStorageMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { mode: "global" | "personal" }) => {
    if (data.mode !== "global" && data.mode !== "personal") throw new Error("Mode tidak valid");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { setStorageMode, getConnectionKeyForUser, DRIVE_CONNECTOR_ID } = await import("./connections.server");
    if (data.mode === "personal") {
      const key = await getConnectionKeyForUser(context.userId, DRIVE_CONNECTOR_ID);
      if (!key) throw new Error("Hubungkan Google Drive pribadi dulu.");
    }
    await setStorageMode(context.userId, data.mode);
    return { ok: true, mode: data.mode };
  });

export const listCloudFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { kind?: string | null; source?: string | null; origin?: string | null } | undefined) => ({
    kind: data?.kind ?? null,
    source: data?.source ?? null,
    origin: data?.origin ?? null,
  }))
  .handler(async ({ data, context }) => {
    const { listCloudFilesForUser } = await import("./registry.server");
    const rows = await listCloudFilesForUser(context.userId, data.kind, {
      source: data.source,
      origin: data.origin,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      mimeType: r.mime_type,
      size: Number(r.size_bytes || 0),
      storage: r.storage_mode,
      origin: r.origin,
      source: r.source,
      meta: (r.meta ?? {}) as Record<string, string | number | boolean | null>,
      sourceUrl: r.source_url,
      createdAt: r.created_at,
      url: `/api/public/cloud/file/${r.id}`,
    }));
  });

export const deleteCloudFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id wajib diisi");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    const { deleteCloudFileForUser } = await import("./registry.server");
    await deleteCloudFileForUser(context.userId, data.id);
    return { ok: true };
  });

export const archiveGeneratedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      url: string;
      name?: string;
      source?: string;
      origin?: string;
      meta?: Record<string, string | number | boolean | null> | null;
    }) => {
      if (!/^https?:\/\//i.test(data?.url ?? "")) throw new Error("URL tidak valid");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const { archiveRemoteUrlForUser } = await import("./registry.server");
    const row = await archiveRemoteUrlForUser({
      userId: context.userId,
      url: data.url,
      name: data.name,
      source: data.source ?? null,
      origin: data.origin ?? "generate",
      meta: data.meta ?? null,
    });
    return {
      id: row.id,
      url: `/api/public/cloud/file/${row.id}`,
      name: row.name,
      kind: row.kind,
      mimeType: row.mime_type,
      size: Number(row.size_bytes || 0),
      source: row.source,
      sourceUrl: row.source_url,
      meta: (row.meta ?? {}) as Record<string, string | number | boolean | null>,
      createdAt: row.created_at,
    };
  });

export const startDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const request = getRequest();
    if (!request) throw new Error("OAuth harus dimulai dari request aplikasi.");

    // Jalur utama: OAuth Google milik aplikasi sendiri (client dikonfigurasi admin).
    const { getOAuthClient, buildAuthUrl, signState, callbackUrl } = await import("./google-oauth.server");
    const ownClient = await getOAuthClient();
    if (ownClient) {
      return {
        authorizationUrl: buildAuthUrl({
          client: ownClient,
          redirectUri: callbackUrl(request.url),
          state: signState({ userId: context.userId, target: "personal", ts: Date.now() }),
        }),
      };
    }

    // Fallback: Lovable App User Connector (kalau tersedia di environment ini).
    const clientKey = process.env.GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY;
    if (!clientKey) {
      throw new Error(
        "Google Drive belum bisa dihubungkan: admin belum mengisi Client ID & Secret Google di Admin → Pengaturan Halaman → Cloud.",
      );
    }

    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionKeyForUser, DRIVE_CONNECTOR_ID } = await import("./connections.server");
    const existing = await getConnectionKeyForUser(context.userId, DRIVE_CONNECTOR_ID);

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: "https://connector-gateway.lovable.dev",
      connectorId: DRIVE_CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl: new URL("/oauth/google-drive/return", request.url).toString(),
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: {
        scopes: [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/drive.file",
        ],
      },
    });
    return { authorizationUrl };
  });

export const completeDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string }) => {
    if (!data?.code) throw new Error("code wajib diisi");
    return { code: data.code };
  })
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser, setStorageMode, DRIVE_CONNECTOR_ID } = await import("./connections.server");
    const { fetchDriveAccountEmail } = await import("./drive.server");

    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      "https://connector-gateway.lovable.dev",
      data.code,
    );
    if (connectorId !== DRIVE_CONNECTOR_ID) throw new Error("OAuth mengembalikan connector yang salah");
    const email = await fetchDriveAccountEmail(connectionAPIKey);
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey, email);
    await setStorageMode(context.userId, "personal");
    return { ok: true, accountEmail: email };
  });

export const disconnectDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionKeyForUser, deleteConnectionForUser, setStorageMode, DRIVE_CONNECTOR_ID } =
      await import("./connections.server");
    const key = await getConnectionKeyForUser(context.userId, DRIVE_CONNECTOR_ID);
    if (key) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl: "https://connector-gateway.lovable.dev",
          connectionAPIKey: key,
          connectorId: DRIVE_CONNECTOR_ID,
        });
      } catch (e) {
        console.warn("[cloud] gateway disconnect failed", e);
      }
    }
    await deleteConnectionForUser(context.userId, DRIVE_CONNECTOR_ID);
    await setStorageMode(context.userId, "global");
    return { ok: true };
  });

/**
 * DIRECT UPLOAD — server hanya membuat sesi upload; byte file dikirim browser
 * langsung ke Google Drive sehingga tidak memakai bandwidth server aplikasi.
 */
export const createCloudUploadTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; mimeType: string; size: number; source?: string | null; origin?: string | null }) => {
    const size = Number(data?.size ?? 0);
    if (!data?.name) throw new Error("name wajib diisi");
    if (!Number.isFinite(size) || size <= 0 || size > 250 * 1024 * 1024) throw new Error("Ukuran file tidak valid");
    return {
      name: String(data.name).slice(0, 200),
      mimeType: data.mimeType || "application/octet-stream",
      size,
      source: data.source ?? null,
      origin: data.origin ?? "upload",
    };
  })
  .handler(async ({ data, context }) => {
    const { UploadService } = await import("./storage/service.server");
    const ticket = await UploadService.createTicket({ userId: context.userId, ...data });
    return {
      uploadUrl: ticket.uploadUrl,
      method: ticket.method,
      headers: ticket.headers ?? {},
      name: ticket.name,
      storage: ticket.mode,
    };
  });

/** Setelah browser selesai PUT ke storage, simpan metadata-nya saja. */
export const finalizeCloudUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      driveFileId: string;
      name: string;
      mimeType: string;
      size: number;
      source?: string | null;
      origin?: string | null;
    }) => {
      if (!data?.driveFileId) throw new Error("driveFileId wajib diisi");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const { registerUploadedFile } = await import("./registry.server");
    const { ctxForUser } = await import("./storage/service.server");
    const { mode } = await ctxForUser(context.userId);
    const row = await registerUploadedFile({
      userId: context.userId,
      storageMode: mode,
      driveFileId: data.driveFileId,
      name: data.name,
      mimeType: data.mimeType || "application/octet-stream",
      size: Number(data.size || 0),
      origin: data.origin ?? "upload",
      source: data.source ?? null,
    });
    return { id: row.id, url: `/api/public/cloud/file/${row.id}`, storage: row.storage_mode };
  });